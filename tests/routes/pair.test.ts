import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import app from "@/index"
import { db } from "@/db"
import { cloudLinks, pairingChallenges } from "@/db/schema"
import { resetDb } from "../helpers/db"
import { signAssertion, signPairAssertion } from "../helpers/jwt"

beforeEach(resetDb)

/**
 * creates a pairing challenge and returns its id and plaintext code
 */
const createChallenge = async () => {
  const res = await app.request("/v1/pairing", { method: "POST" })
  const body = await res.json()
  return body as { id: string; code: string; expiresAt: string }
}

const complete = (code: string, assertion: string) =>
  app.request("/v1/pairing/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, assertion }),
  })

describe("POST /v1/pairing", () => {
  test("creates a challenge with a human-readable code", async () => {
    const res = await app.request("/v1/pairing", { method: "POST" })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})

describe("GET /v1/pairing/:id", () => {
  const status = (id: string) => app.request(`/v1/pairing/${id}`)

  test("reports a fresh challenge as pending, without an assertion id", async () => {
    const challenge = await createChallenge()

    const res = await status(challenge.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: challenge.id, status: "pending", jti: null })
  })

  test("reports a consumed challenge as completed, with the consuming assertion id", async () => {
    const challenge = await createChallenge()
    const assertion = await signAssertion({
      sub: "usr_test",
      bridgeId: "cb_status_1",
      pairingId: challenge.id,
      jti: "jti_status_1",
    })
    expect((await complete(challenge.code, assertion)).status).toBe(200)

    expect(await (await status(challenge.id)).json()).toEqual({
      id: challenge.id,
      status: "completed",
      jti: "jti_status_1",
    })
  })

  test("reports an unused, past-expiry challenge as expired", async () => {
    const challenge = await createChallenge()
    await db
      .update(pairingChallenges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pairingChallenges.id, challenge.id))

    expect((await (await status(challenge.id)).json()).status).toBe("expired")
  })

  test("returns 404 for an unknown challenge", async () => {
    expect((await status(crypto.randomUUID())).status).toBe(404)
  })

  test("rejects an id that is not a uuid", async () => {
    expect((await status("not-a-uuid")).status).toBe(400)
  })
})

describe("POST /v1/pairing/complete", () => {
  test("links the bridge for a valid code and assertion", async () => {
    const challenge = await createChallenge()
    const assertion = await signPairAssertion(challenge.id, "cb_pair_1")

    const res = await complete(challenge.code, assertion)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ linked: true, cloudBridgeId: "cb_pair_1" })

    // the challenge is consumed and a link now exists
    const [pairing] = await db.select().from(pairingChallenges).where(eq(pairingChallenges.id, challenge.id))
    expect(pairing!.usedAt).not.toBeNull()

    const [link] = await db.select().from(cloudLinks).where(eq(cloudLinks.bridgeId, "cb_pair_1"))
    expect(link).toBeDefined()
  })

  test("rejects an unknown code", async () => {
    const challenge = await createChallenge()
    const assertion = await signPairAssertion(challenge.id, "cb_pair_2")

    const res = await complete("ZZZZ-ZZZZ", assertion)
    expect(res.status).toBe(400)
  })

  test("rejects an assertion whose pairing id does not match", async () => {
    const challenge = await createChallenge()
    const assertion = await signPairAssertion("some-other-id", "cb_pair_3")

    const res = await complete(challenge.code, assertion)
    expect(res.status).toBe(401)
  })

  test("rejects a malformed assertion", async () => {
    const challenge = await createChallenge()

    const res = await complete(challenge.code, "not-a-jwt")
    expect(res.status).toBe(401)
  })

  test("rejects reuse of a consumed code", async () => {
    const challenge = await createChallenge()
    const first = await complete(challenge.code, await signPairAssertion(challenge.id, "cb_pair_4"))
    expect(first.status).toBe(200)

    const second = await complete(challenge.code, await signPairAssertion(challenge.id, "cb_pair_5"))
    expect(second.status).toBe(400)
  })

  test("keeps the existing link when the same account pairs again", async () => {
    const first = await createChallenge()
    expect((await complete(first.code, await signPairAssertion(first.id, "cb_pair_6"))).status).toBe(200)

    // a re-scan issues a fresh challenge for the same bridge
    const second = await createChallenge()
    const res = await complete(second.code, await signPairAssertion(second.id, "cb_pair_6"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ linked: true, cloudBridgeId: "cb_pair_6" })

    const links = await db.select().from(cloudLinks).where(eq(cloudLinks.bridgeId, "cb_pair_6"))
    expect(links).toHaveLength(1)
  })

  test("restores a revoked link when the same account pairs again", async () => {
    const first = await createChallenge()
    await complete(first.code, await signPairAssertion(first.id, "cb_pair_7"))
    await db.update(cloudLinks).set({ revokedAt: new Date() }).where(eq(cloudLinks.bridgeId, "cb_pair_7"))

    const second = await createChallenge()
    expect((await complete(second.code, await signPairAssertion(second.id, "cb_pair_7"))).status).toBe(200)

    const [link] = await db.select().from(cloudLinks).where(eq(cloudLinks.bridgeId, "cb_pair_7"))
    expect(link!.revokedAt).toBeNull()
  })

  test("refuses a bridge linked to another account", async () => {
    await db.insert(cloudLinks).values({ cloudUserId: "usr_other", bridgeId: "cb_pair_8" })

    const challenge = await createChallenge()
    const res = await complete(challenge.code, await signPairAssertion(challenge.id, "cb_pair_8"))
    expect(res.status).toBe(409)

    // the challenge stays unused
    const [pairing] = await db.select().from(pairingChallenges).where(eq(pairingChallenges.id, challenge.id))
    expect(pairing!.usedAt).toBeNull()
  })

  test("rejects a request missing fields", async () => {
    const res = await app.request("/v1/pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABCD-EFGH" }),
    })
    expect(res.status).toBe(400)
  })
})
