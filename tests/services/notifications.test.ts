import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { dispatchEvent } from "@/services/notifications/dispatch"
import { sendApns } from "@/services/notifications/apns"
import { sendFcm } from "@/services/notifications/fcm"
import type { Event } from "@/schemas/cooler"
import { resetDb, seedAuthedSession, seedDevice } from "../helpers/db"

// silence and observe the stub loggers
let info: ReturnType<typeof spyOn>
let error: ReturnType<typeof spyOn>

beforeEach(async () => {
  await resetDb()
  info = spyOn(console, "info").mockImplementation(() => {})
  error = spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  info.mockRestore()
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
  title: "ok",
  message: "done",
  createdAt: new Date(),
})

describe("sendApns", () => {
  test("resolves and logs the token and payload", async () => {
    await expect(sendApns("tok-1", { type: "event.available", eventId: "e1" })).resolves.toBeUndefined()
    expect(info).toHaveBeenCalledTimes(1)
  })
})

describe("sendFcm", () => {
  test("resolves and logs the token and payload", async () => {
    await expect(sendFcm("tok-1", { type: "event.available", eventId: "e1" })).resolves.toBeUndefined()
    expect(info).toHaveBeenCalledTimes(1)
  })
})

describe("dispatchEvent", () => {
  test("does nothing when the bridge has no devices", async () => {
    const { bridge } = await seedAuthedSession()

    await dispatchEvent(makeEvent(bridge.id))

    expect(info).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  test("notifies an active apns device", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id, { pushProvider: "apns" })

    await dispatchEvent(makeEvent(bridge.id))

    expect(info).toHaveBeenCalledTimes(1)
    const [label, data] = info.mock.calls[0] as [string, { payload: { type: string } }]
    expect(label).toBe("APNS notification:")
    expect(data.payload.type).toBe("event.available")
  })

  test("notifies an active fcm device", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id, { pushProvider: "fcm" })

    await dispatchEvent(makeEvent(bridge.id))

    expect(info).toHaveBeenCalledTimes(1)
    expect(info.mock.calls[0][0]).toBe("FCM notification:")
  })

  test("notifies every active device for the bridge", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id, { pushProvider: "apns", pushToken: "a" })
    await seedDevice(cloudLink.id, { pushProvider: "fcm", pushToken: "b" })

    await dispatchEvent(makeEvent(bridge.id))

    expect(info).toHaveBeenCalledTimes(2)
  })

  test("skips revoked devices", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id, { revokedAt: new Date() })

    await dispatchEvent(makeEvent(bridge.id))

    expect(info).not.toHaveBeenCalled()
  })

  test("skips devices under a revoked cloud link", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id)

    // revoke the link, then dispatch
    const { db } = await import("@/db")
    const { cloudLinks } = await import("@/db/schema")
    const { eq } = await import("drizzle-orm")
    await db.update(cloudLinks).set({ revokedAt: new Date() }).where(eq(cloudLinks.id, cloudLink.id))

    await dispatchEvent(makeEvent(bridge.id))

    expect(info).not.toHaveBeenCalled()
  })

  test("does not notify devices of a different bridge", async () => {
    const mine = await seedAuthedSession()
    const other = await seedAuthedSession()
    await seedDevice(other.cloudLink.id)

    await dispatchEvent(makeEvent(mine.bridge.id))

    expect(info).not.toHaveBeenCalled()
  })

  test("logs and swallows an unsupported provider without throwing", async () => {
    const { bridge, cloudLink } = await seedAuthedSession()
    await seedDevice(cloudLink.id, { pushProvider: "web" as never })

    await expect(dispatchEvent(makeEvent(bridge.id))).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledTimes(1)
  })
})
