import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import app from "@/index"
import { db } from "@/db"
import { cloudLinks } from "@/db/schema"
import { generateSessionToken, tokenDigest } from "@/auth/utils"
import { resetDb, seedAuthedSession, seedDevice, seedEvent } from "../helpers/db"

beforeEach(resetDb)

/**
 * seeds a bridge with a device holding an event token
 *
 * @param revokedAt device revocation time
 */
const seedDeviceWithToken = async (revokedAt: Date | null = null) => {
  const fixture = await seedAuthedSession()
  const eventToken = generateSessionToken()
  await seedDevice(fixture.cloudLink.id, { eventTokenDigest: tokenDigest(eventToken), revokedAt })

  return { ...fixture, eventToken }
}

/**
 * reads a pushed event with an event token
 */
const getPushedEvent = (id: string, token?: string) =>
  app.request(`/v1/push/events/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

describe("GET /v1/push/events/:id", () => {
  test("returns an event of the device's bridge", async () => {
    const { bridge, eventToken } = await seedDeviceWithToken()
    const event = await seedEvent(bridge.id, { title: "Backup failed" })

    const res = await getPushedEvent(event.id, eventToken)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(event.id)
    expect(body.title).toBe("Backup failed")
  })

  test("does not return another bridge's event", async () => {
    const { eventToken } = await seedDeviceWithToken()
    const other = await seedAuthedSession()
    const event = await seedEvent(other.bridge.id)

    expect((await getPushedEvent(event.id, eventToken)).status).toBe(404)
  })

  test("rejects a session token", async () => {
    const { bridge, token } = await seedDeviceWithToken()
    const event = await seedEvent(bridge.id)

    expect((await getPushedEvent(event.id, token)).status).toBe(401)
  })

  test("rejects a revoked device", async () => {
    const { bridge, eventToken } = await seedDeviceWithToken(new Date())
    const event = await seedEvent(bridge.id)

    expect((await getPushedEvent(event.id, eventToken)).status).toBe(401)
  })

  test("rejects a device under a revoked cloud link", async () => {
    const { bridge, cloudLink, eventToken } = await seedDeviceWithToken()
    const event = await seedEvent(bridge.id)
    await db.update(cloudLinks).set({ revokedAt: new Date() }).where(eq(cloudLinks.id, cloudLink.id))

    expect((await getPushedEvent(event.id, eventToken)).status).toBe(401)
  })

  test("requires authentication", async () => {
    const { bridge } = await seedDeviceWithToken()
    const event = await seedEvent(bridge.id)

    expect((await getPushedEvent(event.id)).status).toBe(401)
  })
})
