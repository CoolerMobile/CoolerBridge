import { beforeEach, describe, expect, test } from "bun:test"
import app from "@/index"
import { generateSessionToken, tokenDigest } from "@/auth/utils"
import { resetDb, seedAuthedSession, seedBridge, seedCloudLink, seedSession } from "../helpers/db"
import { db } from "@/db"
import { cloudLinks } from "@/db/schema"
import { eq } from "drizzle-orm"

beforeEach(resetDb)

// /v1/auth/me is the simplest requireAuth-gated route
const me = (headers: Record<string, string> = {}) => app.request("/v1/auth/me", { headers })

describe("requireAuth", () => {
  test("rejects a missing Authorization header", async () => {
    expect((await me()).status).toBe(401)
  })

  test("rejects a non-bearer scheme", async () => {
    expect((await me({ Authorization: "Basic abc" })).status).toBe(401)
  })

  test("rejects an unknown token", async () => {
    expect((await me({ Authorization: "Bearer cbt_unknown" })).status).toBe(401)
  })

  test("accepts a valid token", async () => {
    const { token } = await seedAuthedSession()
    expect((await me({ Authorization: `Bearer ${token}` })).status).toBe(200)
  })

  test("rejects an expired session", async () => {
    const bridge = await seedBridge()
    const link = await seedCloudLink(bridge.id)
    const token = generateSessionToken()
    await seedSession({
      cloudLinkId: link.id,
      bridgeId: bridge.id,
      tokenDigest: tokenDigest(token),
      expiresAt: new Date(Date.now() - 1000),
    })

    expect((await me({ Authorization: `Bearer ${token}` })).status).toBe(401)
  })

  test("rejects a revoked session", async () => {
    const bridge = await seedBridge()
    const link = await seedCloudLink(bridge.id)
    const token = generateSessionToken()
    await seedSession({
      cloudLinkId: link.id,
      bridgeId: bridge.id,
      tokenDigest: tokenDigest(token),
      revokedAt: new Date(),
    })

    expect((await me({ Authorization: `Bearer ${token}` })).status).toBe(401)
  })

  test("rejects a session whose cloud link is revoked", async () => {
    const { cloudLink, token } = await seedAuthedSession()
    await db.update(cloudLinks).set({ revokedAt: new Date() }).where(eq(cloudLinks.id, cloudLink.id))

    expect((await me({ Authorization: `Bearer ${token}` })).status).toBe(401)
  })
})

describe("requireScopes", () => {
  test("returns 403 when the required scope is missing", async () => {
    const { token } = await seedAuthedSession([])

    const res = await app.request("/v1/events", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(403)
  })

  test("allows a session that holds the required scope", async () => {
    const { token } = await seedAuthedSession(["events:read"])

    const res = await app.request("/v1/events", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
  })

  test("enforces every listed scope, not just the first", async () => {
    // holds devices:read but not devices:write, which the delete route needs
    const { token } = await seedAuthedSession(["devices:read"])

    const res = await app.request(`/v1/devices/${crypto.randomUUID()}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(403)
  })
})
