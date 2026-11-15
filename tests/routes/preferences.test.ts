import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import app from "@/index"
import { db } from "@/db"
import { devices } from "@/db/schema"
import { generateSessionToken, tokenDigest } from "@/auth/utils"
import { resetDb, seedAuthedSession, seedDevice } from "../helpers/db"

beforeEach(resetDb)

const preferences = {
  timeZone: "Europe/Lisbon",
  quietHours: { from: 22 * 60, to: 7 * 60 },
  categories: { deployments: true, backups: false, scheduledTasks: true, servers: true },
}

/**
 * puts preferences with an event token
 */
const putPreferences = (body: unknown, token?: string) =>
  app.request("/v1/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })

describe("PUT /v1/preferences", () => {
  test("stores the calling device's preferences", async () => {
    const { cloudLink } = await seedAuthedSession()
    const eventToken = generateSessionToken()
    const device = await seedDevice(cloudLink.id, { eventTokenDigest: tokenDigest(eventToken) })

    const res = await putPreferences(preferences, eventToken)

    expect(res.status).toBe(200)
    const [row] = await db.select().from(devices).where(eq(devices.id, device.id))
    expect(row!.preferences).toEqual(preferences)
  })

  test("rejects an unknown time zone", async () => {
    const { cloudLink } = await seedAuthedSession()
    const eventToken = generateSessionToken()
    await seedDevice(cloudLink.id, { eventTokenDigest: tokenDigest(eventToken) })

    const res = await putPreferences({ ...preferences, timeZone: "Mars/Olympus" }, eventToken)

    expect(res.status).toBe(400)
  })

  test("requires an event token", async () => {
    expect((await putPreferences(preferences)).status).toBe(401)
  })
})
