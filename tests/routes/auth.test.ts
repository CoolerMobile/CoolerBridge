import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import app from "@/index"
import { db } from "@/db"
import { sessions } from "@/db/schema"
import { tokenDigest } from "@/auth/utils"
import { resetDb, seedAuthedSession, seedBridge, seedCloudLink } from "../helpers/db"
import { signAccessAssertion, signAssertion } from "../helpers/jwt"

beforeEach(resetDb)

describe("GET /v1/auth/me", () => {
  test("returns the current session for a valid token", async () => {
    const { session, token } = await seedAuthedSession(["events:read"])

    const res = await app.request("/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe(session.id)
    expect(body.scopes).toEqual(["events:read"])
  })

  test("rejects a request without a token", async () => {
    const res = await app.request("/v1/auth/me")
    expect(res.status).toBe(401)
  })
})

describe("POST /v1/auth/logout", () => {
  test("revokes the active session", async () => {
    const { session, token } = await seedAuthedSession()

    const res = await app.request("/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ loggedOut: true })

    const [row] = await db.select().from(sessions).where(eq(sessions.id, session.id))
    expect(row!.revokedAt).not.toBeNull()
  })

  test("a revoked token can no longer authenticate", async () => {
    const { token } = await seedAuthedSession()

    await app.request("/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

    const res = await app.request("/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(401)
  })
})

describe("POST /v1/auth/exchange", () => {
  test("issues a session token for a linked bridge", async () => {
    // cloud_bridge_id is stored as the bridge uuid so the session fk resolves
    const bridge = await seedBridge()
    await seedCloudLink(bridge.id)

    const assertion = await signAccessAssertion(bridge.id, [
      "events:read",
      "devices:write",
      "not-a-real-scope",
    ])

    const res = await app.request("/v1/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accessToken).toMatch(/^cbt_/)
    expect(body.tokenType).toBe("Bearer")
    // unknown scopes are filtered out
    expect(body.scopes).toEqual(["events:read", "devices:write"])

    // a matching session row exists for the issued token
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenDigest, tokenDigest(body.accessToken)))
    expect(row).toBeDefined()
  })

  test("rejects an invalid assertion", async () => {
    const res = await app.request("/v1/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion: "not-a-jwt" }),
    })
    expect(res.status).toBe(401)
  })

  test("rejects when no cloud link exists", async () => {
    const assertion = await signAssertion({ sub: "usr_test", bridgeId: "cb_unlinked" })

    const res = await app.request("/v1/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion }),
    })
    expect(res.status).toBe(403)
  })

  test("rejects when the link is revoked", async () => {
    const bridge = await seedBridge()
    await seedCloudLink(bridge.id, true)

    const assertion = await signAccessAssertion(bridge.id, ["events:read"])

    const res = await app.request("/v1/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion }),
    })
    expect(res.status).toBe(403)
  })

  test("rejects an empty body", async () => {
    const res = await app.request("/v1/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})
