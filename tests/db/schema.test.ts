import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { bridges, cloudLinks, devices, events, pairingChallenges, sessions } from "@/db/schema"
import { resetDb, run, seedBridge, seedCloudLink, seedDevice } from "../helpers/db"

beforeEach(resetDb)

describe("bridges table", () => {
  test("applies column defaults", async () => {
    const [bridge] = await db.insert(bridges).values({ secret: "s1" }).returning()

    expect(bridge!.name).toBe("Coolify")
    expect(bridge!.enabled).toBe(true)
    expect(bridge!.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(bridge!.createdAt).toBeInstanceOf(Date)
  })

  test("enforces a unique secret", async () => {
    await db.insert(bridges).values({ secret: "dup" })
    expect(run(db.insert(bridges).values({ secret: "dup" }))).rejects.toThrow()
  })
})

describe("events table", () => {
  test("persists an event tied to a bridge", async () => {
    const bridge = await seedBridge()

    const [event] = await db
      .insert(events)
      .values({
        bridgeId: bridge.id,
        type: "deployment_success",
        severity: "success",
        title: "ok",
        message: "done",
        metadata: { deploymentId: "dep-1" },
      })
      .returning()

    expect(event!.bridgeId).toBe(bridge.id)
    expect(event!.metadata).toEqual({ deploymentId: "dep-1" })
    expect(event!.createdAt).toBeInstanceOf(Date)
  })

  test("rejects an invalid severity enum", async () => {
    const bridge = await seedBridge()

    expect(
      run(
        db.insert(events).values({
          bridgeId: bridge.id,
          type: "x",
          severity: "critical" as never,
          title: "t",
          message: "m",
        })
      )
    ).rejects.toThrow()
  })

  test("cascades deletes from the owning bridge", async () => {
    const bridge = await seedBridge()
    await db.insert(events).values({
      bridgeId: bridge.id,
      type: "x",
      severity: "info",
      title: "t",
      message: "m",
    })

    await db.delete(bridges).where(eq(bridges.id, bridge.id))

    const remaining = await db.select().from(events).where(eq(events.bridgeId, bridge.id))
    expect(remaining).toHaveLength(0)
  })

  test("requires an existing bridge", async () => {
    expect(
      run(
        db.insert(events).values({
          bridgeId: crypto.randomUUID(),
          type: "x",
          severity: "info",
          title: "t",
          message: "m",
        })
      )
    ).rejects.toThrow()
  })
})

describe("cloud_links table", () => {
  test("enforces a unique cloud bridge id", async () => {
    await seedCloudLink("cb_dup")
    expect(run(seedCloudLink("cb_dup"))).rejects.toThrow()
  })
})

describe("pairing_challenges table", () => {
  test("enforces a unique code digest", async () => {
    const expiresAt = new Date(Date.now() + 60_000)
    await db.insert(pairingChallenges).values({ codeDigest: "digest", expiresAt })

    expect(run(db.insert(pairingChallenges).values({ codeDigest: "digest", expiresAt }))).rejects.toThrow()
  })
})

describe("sessions table", () => {
  test("defaults scopes to an empty array", async () => {
    const bridge = await seedBridge()
    const link = await seedCloudLink(bridge.id)

    const [session] = await db
      .insert(sessions)
      .values({
        cloudLinkId: link.id,
        bridgeId: bridge.id,
        tokenDigest: "td-1",
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning()

    expect(session!.scopes).toEqual([])
  })

  test("enforces a unique token digest", async () => {
    const bridge = await seedBridge()
    const link = await seedCloudLink(bridge.id)
    const values = {
      cloudLinkId: link.id,
      bridgeId: bridge.id,
      tokenDigest: "same",
      expiresAt: new Date(Date.now() + 60_000),
    }

    await db.insert(sessions).values(values)
    expect(run(db.insert(sessions).values(values))).rejects.toThrow()
  })

  test("cascades deletes from the cloud link", async () => {
    const bridge = await seedBridge()
    const link = await seedCloudLink(bridge.id)
    await db.insert(sessions).values({
      cloudLinkId: link.id,
      bridgeId: bridge.id,
      tokenDigest: "td-2",
      expiresAt: new Date(Date.now() + 60_000),
    })

    await db.delete(cloudLinks).where(eq(cloudLinks.id, link.id))

    const remaining = await db.select().from(sessions).where(eq(sessions.cloudLinkId, link.id))
    expect(remaining).toHaveLength(0)
  })
})

describe("devices table", () => {
  test("persists a device tied to a cloud link", async () => {
    const bridge = await seedBridge()
    const link = await seedCloudLink(bridge.id)

    const device = await seedDevice(link.id, { platform: "android", pushProvider: "fcm" })

    expect(device.cloudLinkId).toBe(link.id)
    expect(device.platform).toBe("android")
    expect(device.pushProvider).toBe("fcm")
    expect(device.createdAt).toBeInstanceOf(Date)
  })

  test("enforces a unique push token", async () => {
    const bridge = await seedBridge()
    const link = await seedCloudLink(bridge.id)
    await seedDevice(link.id, { pushToken: "dup" })

    expect(run(seedDevice(link.id, { pushToken: "dup" }))).rejects.toThrow()
  })

  test("cascades deletes from the cloud link", async () => {
    const bridge = await seedBridge()
    const link = await seedCloudLink(bridge.id)
    await seedDevice(link.id)

    await db.delete(cloudLinks).where(eq(cloudLinks.id, link.id))

    const remaining = await db.select().from(devices).where(eq(devices.cloudLinkId, link.id))
    expect(remaining).toHaveLength(0)
  })
})
