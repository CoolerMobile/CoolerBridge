import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Expo } from "expo-server-sdk"
import app from "@/index"
import { db } from "@/db"
import { cloudLinks, events } from "@/db/schema"
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

describe("POST /v1/push/test", () => {
  // stub expo's network call and silence the failure logger
  let send: ReturnType<typeof spyOn>
  let error: ReturnType<typeof spyOn>

  beforeEach(() => {
    send = spyOn(Expo.prototype, "sendPushNotificationsAsync").mockImplementation(async (messages) =>
      messages.map(() => ({ status: "ok" as const, id: crypto.randomUUID() }))
    )
    error = spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    send.mockRestore()
    error.mockRestore()
  })

  /**
   * sends a test push with optional headers
   */
  const sendTest = (headers: Record<string, string> = {}) =>
    app.request("/v1/push/test", { method: "POST", headers })

  test("stores a test event and pushes it to every active device", async () => {
    const { bridge, cloudLink, authHeader } = await seedAuthedSession(["push:test"])
    await seedDevice(cloudLink.id, { platform: "ios" })
    await seedDevice(cloudLink.id, { platform: "android" })
    await seedDevice(cloudLink.id, { revokedAt: new Date() })

    const res = await sendTest(authHeader)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.devices).toBe(2)
    expect(body.delivered).toBe(2)
    expect(body.failed).toBe(0)
    expect(body.deliveries).toHaveLength(2)

    // the push only carries ids, the app fetches the stored event
    const [messages] = send.mock.calls[0] as [{ data: Record<string, string> }[]]
    expect(messages.map((message) => message.data)).toEqual([
      { type: "event.available", eventId: body.eventId, bridgeId: bridge.id },
      { type: "event.available", eventId: body.eventId, bridgeId: bridge.id },
    ])

    const stored = await db.query.events.findFirst({ where: eq(events.id, body.eventId) })
    expect(stored).toMatchObject({ bridgeId: bridge.id, type: "bridge.test", severity: "info" })
  })

  test("ignores quiet hours and muted categories", async () => {
    const { cloudLink, authHeader } = await seedAuthedSession(["push:test"])
    const now = new Date()
    const minute = now.getUTCHours() * 60 + now.getUTCMinutes()

    // quiet hours around the current minute, every category muted
    await seedDevice(cloudLink.id, {
      preferences: {
        timeZone: "UTC",
        quietHours: { from: (minute + 1380) % 1440, to: (minute + 60) % 1440 },
        categories: { deployments: false, backups: false, scheduledTasks: false, servers: false },
      },
    })

    const body = await (await sendTest(authHeader)).json()

    expect(body.delivered).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  test("reports failed deliveries", async () => {
    send.mockResolvedValue([{ status: "error", message: "boom" }])
    const { cloudLink, authHeader } = await seedAuthedSession(["push:test"])
    await seedDevice(cloudLink.id)

    const body = await (await sendTest(authHeader)).json()

    expect(body.delivered).toBe(0)
    expect(body.failed).toBe(1)
    expect(body.deliveries[0]).toMatchObject({ status: "error", error: "boom" })
  })

  test("stores nothing without active devices", async () => {
    const { authHeader } = await seedAuthedSession(["push:test"])

    const res = await sendTest(authHeader)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ eventId: null, devices: 0, delivered: 0, failed: 0, deliveries: [] })
    expect(send).not.toHaveBeenCalled()
    expect(await db.query.events.findMany()).toHaveLength(0)
  })

  test("never reaches another bridge's devices", async () => {
    const { authHeader } = await seedAuthedSession(["push:test"])
    const other = await seedAuthedSession()
    await seedDevice(other.cloudLink.id)

    const body = await (await sendTest(authHeader)).json()

    expect(body.devices).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  test("requires the push:test scope", async () => {
    const { cloudLink, authHeader } = await seedAuthedSession(["events:read"])
    await seedDevice(cloudLink.id)

    expect((await sendTest(authHeader)).status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  test("requires authentication", async () => {
    expect((await sendTest()).status).toBe(401)
  })
})
