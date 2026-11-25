import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Expo } from "expo-server-sdk"
import app from "@/index"
import { db } from "@/db"
import { bridges, cloudLinks, events, pairingChallenges, sessions } from "@/db/schema"
import { resetDb, seedAuthedSession, seedBridge, seedCloudLink, seedDevice } from "../helpers/db"
import { signAccessAssertion, signPairAssertion } from "../helpers/jwt"
import { disableChannel, enableChannel, relaySecret, restoreCloud, stubCloud } from "../helpers/cloud"

/**
 * the hosted relay gate, end to end through the routes
 *
 * every check reaches the fake cloud (caching is off), which answers for the
 * seeded cloud user
 */

// stub expo's network call and silence the failure logger
let send: ReturnType<typeof spyOn>
let error: ReturnType<typeof spyOn>

beforeEach(async () => {
  await resetDb()
  send = spyOn(Expo.prototype, "sendPushNotificationsAsync").mockImplementation(async (messages) =>
    messages.map(() => ({ status: "ok" as const, id: crypto.randomUUID() }))
  )
  error = spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  restoreCloud()
  disableChannel()
  delete process.env.CONTINGENCY_FAIL_OPEN
  send.mockRestore()
  error.mockRestore()
})

// cloud answers for each kind of account
const entitled = { contingency: false, relay: true }
const notEntitled = { contingency: false, relay: false }

/**
 * posts a coolify webhook payload for a given secret
 */
const postWebhook = (secret: string) =>
  app.request(`/v1/webhooks/coolify/${secret}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, event: "deployment_success", message: "deployed" }),
  })

/**
 * seeds a bridge linked to the test cloud user, with one device to push to
 */
const seedLinkedBridge = async () => {
  const bridge = await seedBridge()
  const link = await seedCloudLink(bridge.id)
  await seedDevice(link.id)
  return bridge
}

/**
 * counts the events stored for a bridge
 *
 * @param bridgeId bridge uuid
 */
const storedEvents = async (bridgeId: string) =>
  (await db.select().from(events).where(eq(events.bridgeId, bridgeId))).length

describe("POST /v1/webhooks/coolify/:secret", () => {
  test("stores and pushes for an entitled account", async () => {
    enableChannel()
    stubCloud(entitled)
    const bridge = await seedLinkedBridge()

    expect((await postWebhook(bridge.secret)).status).toBe(202)
    expect(await storedEvents(bridge.id)).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  test("refuses an account without the relay plan, storing and pushing nothing", async () => {
    enableChannel()
    stubCloud(notEntitled)
    const bridge = await seedLinkedBridge()

    const res = await postWebhook(bridge.secret)

    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({ error: "The hosted relay isn't available for this account" })
    expect(await storedEvents(bridge.id)).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  test("fails closed when the cloud is unreachable, even with contingency failing open", async () => {
    enableChannel()
    process.env.CONTINGENCY_FAIL_OPEN = "true"
    stubCloud("down")
    const bridge = await seedLinkedBridge()

    expect((await postWebhook(bridge.secret)).status).toBe(402)
    expect(send).not.toHaveBeenCalled()
  })

  test("refuses a bridge with no cloud link, without asking the cloud", async () => {
    enableChannel()
    const calls = stubCloud(entitled)
    const bridge = await seedBridge()

    expect((await postWebhook(bridge.secret)).status).toBe(403)
    expect(await storedEvents(bridge.id)).toBe(0)
    expect(calls).toHaveLength(0)
  })

  test("leaves a self-hosted bridge alone, linked or not, without asking the cloud", async () => {
    const calls = stubCloud(notEntitled)
    const unlinked = await seedBridge()
    const linked = await seedLinkedBridge()

    expect((await postWebhook(unlinked.secret)).status).toBe(202)
    expect((await postWebhook(linked.secret)).status).toBe(202)
    expect(calls).toHaveLength(0)
  })

  test("leaves a self-hosted bridge on the contingency channel free, only reading contingency", async () => {
    enableChannel({ gated: false })
    stubCloud(notEntitled)
    const unlinked = await seedBridge()
    const linked = await seedLinkedBridge()

    expect((await postWebhook(unlinked.secret)).status).toBe(202)
    expect((await postWebhook(linked.secret)).status).toBe(202)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe("POST /v1/auth/exchange", () => {
  const exchange = async () => {
    const bridge = await seedBridge()
    await seedCloudLink(bridge.id)
    return app.request("/v1/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion: await signAccessAssertion(bridge.id, ["events:read"]) }),
    })
  }

  test("issues a session to an entitled account", async () => {
    enableChannel()
    stubCloud(entitled)

    expect((await exchange()).status).toBe(200)
  })

  test("refuses an account without the relay plan, issuing no session", async () => {
    enableChannel()
    stubCloud(notEntitled)

    expect((await exchange()).status).toBe(402)
    expect(await db.select().from(sessions)).toHaveLength(0)
  })

  test("fails closed when the cloud is unreachable, even with contingency failing open", async () => {
    enableChannel()
    process.env.CONTINGENCY_FAIL_OPEN = "true"
    stubCloud("down")

    expect((await exchange()).status).toBe(402)
  })

  test("leaves a self-hosted bridge alone", async () => {
    stubCloud(notEntitled)
    expect((await exchange()).status).toBe(200)
  })
})

describe("POST /v1/pairing/complete", () => {
  const pair = async () => {
    const challenge = (await (await app.request("/v1/pairing", { method: "POST" })).json()) as {
      id: string
      code: string
    }
    const res = await app.request("/v1/pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: challenge.code,
        assertion: await signPairAssertion(challenge.id, "cb_relay"),
      }),
    })
    return { res, challenge }
  }

  test("pairs an entitled account", async () => {
    enableChannel()
    stubCloud(entitled)

    expect((await pair()).res.status).toBe(200)
  })

  test("refuses an account without the relay plan, leaving the code unused and nothing linked", async () => {
    enableChannel()
    stubCloud(notEntitled)

    const { res, challenge } = await pair()

    expect(res.status).toBe(402)
    const stored = await db.query.pairingChallenges.findFirst({
      where: eq(pairingChallenges.id, challenge.id),
    })
    expect(stored!.usedAt).toBeNull()
    expect(await db.select().from(cloudLinks)).toHaveLength(0)
  })

  test("fails closed when the cloud is unreachable", async () => {
    enableChannel()
    stubCloud(503)

    expect((await pair()).res.status).toBe(402)
  })

  test("leaves a self-hosted bridge alone", async () => {
    stubCloud(notEntitled)
    expect((await pair()).res.status).toBe(200)
  })
})

describe("POST /v1/push/test", () => {
  const sendTest = async () => {
    const { cloudLink, authHeader } = await seedAuthedSession(["push:test"])
    await seedDevice(cloudLink.id)
    return app.request("/v1/push/test", { method: "POST", headers: authHeader })
  }

  test("sends for an entitled account", async () => {
    enableChannel()
    stubCloud(entitled)

    expect((await sendTest()).status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
  })

  test("refuses an account without the relay plan, sending nothing", async () => {
    enableChannel()
    stubCloud(notEntitled)

    expect((await sendTest()).status).toBe(402)
    expect(send).not.toHaveBeenCalled()
  })

  test("leaves a self-hosted bridge alone", async () => {
    stubCloud(notEntitled)
    expect((await sendTest()).status).toBe(200)
  })
})

describe("POST /v1/bridges", () => {
  const create = (headers: Record<string, string> = {}) =>
    app.request("/v1/bridges", { method: "POST", headers })

  test("only lets the cloud create bridges on the hosted relay", async () => {
    enableChannel()

    expect((await create()).status).toBe(401)
    expect((await create({ Authorization: "Bearer wrong" })).status).toBe(401)
    expect((await create({ Authorization: relaySecret })).status).toBe(401)
    expect(await db.select().from(bridges)).toHaveLength(0)

    expect((await create({ Authorization: `Bearer ${relaySecret}` })).status).toBe(201)
  })

  test("refuses everyone when the hosted relay has no relay secret", async () => {
    enableChannel()
    delete process.env.BRIDGE_RELAY_SECRET

    expect((await create({ Authorization: "Bearer " })).status).toBe(401)
    expect((await create({ Authorization: `Bearer ${relaySecret}` })).status).toBe(401)
  })

  test("leaves a self-hosted bridge open", async () => {
    expect((await create()).status).toBe(201)
  })
})
