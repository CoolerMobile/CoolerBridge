import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Expo } from "expo-server-sdk"
import { db } from "@/db"
import { devices } from "@/db/schema"
import type { Device, Event } from "@/schemas/cooler"
import { dispatchEvent } from "@/services/notifications/dispatch"
import { buildMessage, expoPushProvider, PLACEHOLDER_ALERT } from "@/services/notifications/expo"
import { resetDb, seedAuthedSession, seedDevice } from "../helpers/db"

// stub expo's network call and observe the error logger
let send: ReturnType<typeof spyOn>
let error: ReturnType<typeof spyOn>

beforeEach(async () => {
  await resetDb()
  send = spyOn(Expo.prototype, "sendPushNotificationsAsync").mockResolvedValue([])
  error = spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  send.mockRestore()
  error.mockRestore()
})

/**
 * builds a minimal event for a bridge
 */
const makeEvent = (bridgeId: string): Event => ({
  id: crypto.randomUUID(),
  bridgeId,
  type: "deployment_success",
  severity: "success",
  title: "Deployment successful",
  message: "web deployed",
  createdAt: new Date(),
})

const allCategories = { deployments: true, backups: true, scheduledTasks: true, servers: true }

/**
 * builds a minimal device
 */
const makeDevice = (overrides: Partial<Device> = {}): Device => ({
  id: crypto.randomUUID(),
  cloudLinkId: crypto.randomUUID(),
  platform: "ios",
  pushToken: `ExponentPushToken[${crypto.randomUUID()}]`,
  createdAt: new Date(),
  lastSeenAt: null,
  ...overrides,
})

describe("buildMessage", () => {
  const event = { ...makeEvent(crypto.randomUUID()), metadata: { errorOutput: "secret" } }
  const data = { type: "event.available", eventId: event.id, bridgeId: event.bridgeId }

  test("sends ios a generic mutable alert the extension rewrites", () => {
    const device = makeDevice({ platform: "ios" })

    expect(buildMessage(device, event)).toEqual({
      to: device.pushToken,
      priority: "high",
      ...PLACEHOLDER_ALERT,
      sound: "default",
      mutableContent: true,
      data,
    })
  })

  test("sends android a data-only message", () => {
    const device = makeDevice({ platform: "android" })

    expect(buildMessage(device, event)).toEqual({ to: device.pushToken, priority: "high", data })
  })

  test("never carries event content", () => {
    for (const platform of ["ios", "android"] as const) {
      const serialized = JSON.stringify(buildMessage(makeDevice({ platform }), event))

      expect(serialized).not.toContain(event.title)
      expect(serialized).not.toContain(event.message)
      expect(serialized).not.toContain("secret")
    }
  })
})

describe("expoPushProvider.send", () => {
  test("skips devices without a valid expo token", async () => {
    const deliveries = await expoPushProvider.send(
      [makeDevice({ pushToken: "not-an-expo-token" })],
      makeEvent(crypto.randomUUID())
    )

    expect(deliveries).toHaveLength(0)
    expect(send).not.toHaveBeenCalled()
  })

  test("maps a successful ticket to an ok delivery", async () => {
    send.mockResolvedValue([{ status: "ok", id: "receipt-1" }])
    const device = makeDevice()

    const [delivery] = await expoPushProvider.send([device], makeEvent(crypto.randomUUID()))

    expect(delivery).toEqual({ deviceId: device.id, status: "ok", ticketId: "receipt-1" })
  })

  test("maps an error ticket to an error delivery", async () => {
    send.mockResolvedValue([{ status: "error", message: "boom" }])
    const device = makeDevice()

    const [delivery] = await expoPushProvider.send([device], makeEvent(crypto.randomUUID()))

    expect(delivery).toEqual({ deviceId: device.id, status: "error", error: "boom" })
  })

  test("revokes a device expo no longer recognizes", async () => {
    const { cloudLink } = await seedAuthedSession()
    const device = await seedDevice(cloudLink.id)

    send.mockResolvedValue([{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }])

    await expoPushProvider.send(
      [makeDevice({ id: device.id, pushToken: device.pushToken })],
      makeEvent(crypto.randomUUID())
    )

    const [row] = await db.select().from(devices).where(eq(devices.id, device.id))
    expect(row?.revokedAt).toBeInstanceOf(Date)
  })
})

describe("dispatchEvent", () => {
  test("does nothing when the bridge has no devices", async () => {
    const { bridge } = await seedAuthedSession()

    await dispatchEvent(makeEvent(bridge.id))

    expect(send).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  test("sends to an active device via expo", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    const device = await seedDevice(cloudLink.id)
    send.mockResolvedValue([{ status: "ok", id: "receipt-1" }])

    await dispatchEvent(makeEvent(bridge.id))

    expect(send).toHaveBeenCalledTimes(1)
    const [chunk] = send.mock.calls[0] as [{ to: string }[]]
    expect(chunk[0].to).toBe(device.pushToken)
    expect(error).not.toHaveBeenCalled()
  })

  test("sends to every active device for the bridge", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id)
    await seedDevice(cloudLink.id)
    send.mockResolvedValue([
      { status: "ok", id: "r1" },
      { status: "ok", id: "r2" },
    ])

    await dispatchEvent(makeEvent(bridge.id))

    expect(send).toHaveBeenCalledTimes(1)
    const [chunk] = send.mock.calls[0] as [unknown[]]
    expect(chunk).toHaveLength(2)
  })

  test("logs a failed delivery", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id)
    send.mockResolvedValue([{ status: "error", message: "nope" }])

    await dispatchEvent(makeEvent(bridge.id))

    expect(error).toHaveBeenCalledTimes(1)
  })

  test("skips revoked devices", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id, { revokedAt: new Date() })

    await dispatchEvent(makeEvent(bridge.id))

    expect(send).not.toHaveBeenCalled()
  })

  test("skips devices under a revoked cloud link", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id)

    // revoke the link, then dispatch
    const { cloudLinks } = await import("@/db/schema")
    await db.update(cloudLinks).set({ revokedAt: new Date() }).where(eq(cloudLinks.id, cloudLink.id))

    await dispatchEvent(makeEvent(bridge.id))

    expect(send).not.toHaveBeenCalled()
  })

  test("skips devices that muted the event's category", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id, {
      preferences: {
        timeZone: "UTC",
        quietHours: null,
        categories: { deployments: false, backups: true, scheduledTasks: true, servers: true },
      },
    })

    await dispatchEvent({ ...makeEvent(bridge.id), category: "deployments" })

    expect(send).not.toHaveBeenCalled()
  })

  test("skips devices in their quiet hours", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    // a window around the current minute, wrapping past midnight when needed
    const now = new Date()
    const minute = now.getUTCHours() * 60 + now.getUTCMinutes()
    await seedDevice(cloudLink.id, {
      preferences: {
        timeZone: "UTC",
        quietHours: { from: (minute + 1440 - 30) % 1440, to: (minute + 30) % 1440 },
        categories: allCategories,
      },
    })

    await dispatchEvent(makeEvent(bridge.id))

    expect(send).not.toHaveBeenCalled()
  })

  test("does not notify devices of a different bridge", async () => {
    const mine = await seedAuthedSession()
    const other = await seedAuthedSession()
    await seedDevice(other.cloudLink.id)

    await dispatchEvent(makeEvent(mine.bridge.id))

    expect(send).not.toHaveBeenCalled()
  })
})
