import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import app from "@/index"
import { db } from "@/db"
import { devices } from "@/db/schema"
import { resetDb, seedAuthedSession, seedDevice } from "../helpers/db"

beforeEach(resetDb)

const body = (deviceData: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ deviceData }),
})

describe("GET /v1/devices", () => {
  test("lists the cloud link's devices, newest first", async () => {
    const { cloudLink, token } = await seedAuthedSession(["devices:read"])

    const older = await seedDevice(cloudLink.id, { pushToken: "older" })
    await Bun.sleep(5)
    const newer = await seedDevice(cloudLink.id, { pushToken: "newer" })

    const res = await app.request("/v1/devices", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const list = await res.json()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe(newer.id)
    expect(list[1].id).toBe(older.id)
  })

  test("does not list another link's devices", async () => {
    const { token } = await seedAuthedSession(["devices:read"])
    const other = await seedAuthedSession(["devices:read"])
    await seedDevice(other.cloudLink.id)

    const res = await app.request("/v1/devices", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(await res.json()).toHaveLength(0)
  })

  test("requires authentication", async () => {
    expect((await app.request("/v1/devices")).status).toBe(401)
  })

  test("requires the devices:read scope", async () => {
    const { token } = await seedAuthedSession([])

    const res = await app.request("/v1/devices", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(403)
  })
})

describe("POST /v1/devices", () => {
  test("registers a device for the cloud link", async () => {
    const { cloudLink, token } = await seedAuthedSession(["devices:read", "devices:write"])

    const res = await app.request("/v1/devices", {
      ...body({ platform: "ios", pushProvider: "apns", pushToken: "tok-1" }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })

    expect(res.status).toBe(201)
    const device = await res.json()
    expect(device.pushToken).toBe("tok-1")
    expect(device.cloudLinkId).toBe(cloudLink.id)

    const [row] = await db.select().from(devices).where(eq(devices.id, device.id))
    expect(row).toBeDefined()
  })

  test("rejects an invalid body", async () => {
    const { token } = await seedAuthedSession(["devices:read", "devices:write"])

    const res = await app.request("/v1/devices", {
      ...body({ platform: "windows", pushProvider: "apns", pushToken: "tok" }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })

    expect(res.status).toBe(400)
  })

  test("requires the devices:write scope", async () => {
    const { token } = await seedAuthedSession(["devices:read"])

    const res = await app.request("/v1/devices", {
      ...body({ platform: "ios", pushProvider: "apns", pushToken: "tok-2" }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })

    expect(res.status).toBe(403)
  })

  test("requires authentication", async () => {
    const res = await app.request(
      "/v1/devices",
      body({
        platform: "ios",
        pushProvider: "apns",
        pushToken: "tok-3",
      })
    )
    expect(res.status).toBe(401)
  })
})

describe("DELETE /v1/devices/:id", () => {
  test("removes an owned device", async () => {
    const { cloudLink, token } = await seedAuthedSession(["devices:read", "devices:write"])
    const device = await seedDevice(cloudLink.id)

    const res = await app.request(`/v1/devices/${device.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deviceId: device.id, deleted: true })

    const rows = await db.select().from(devices).where(eq(devices.id, device.id))
    expect(rows).toHaveLength(0)
  })

  test("does not delete a device owned by another link", async () => {
    const { token } = await seedAuthedSession(["devices:read", "devices:write"])
    const other = await seedAuthedSession(["devices:read", "devices:write"])
    const device = await seedDevice(other.cloudLink.id)

    const res = await app.request(`/v1/devices/${device.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })

    // nothing deleted for this link
    expect(res.status).toBe(500)

    const rows = await db.select().from(devices).where(eq(devices.id, device.id))
    expect(rows).toHaveLength(1)
  })

  test("requires authentication", async () => {
    const res = await app.request(`/v1/devices/${crypto.randomUUID()}`, { method: "DELETE" })
    expect(res.status).toBe(401)
  })
})
