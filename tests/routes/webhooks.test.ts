import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import app from "@/index"
import { db } from "@/db"
import { events } from "@/db/schema"
import { resetDb, seedBridge } from "../helpers/db"

beforeEach(resetDb)

/**
 * posts a coolify webhook payload for a given secret
 */
const postWebhook = (secret: string, payload: unknown) =>
  app.request(`/v1/webhooks/coolify/${secret}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

describe("POST /v1/webhooks/coolify/:secret", () => {
  test("persists a normalized event for a known bridge", async () => {
    const bridge = await seedBridge("wh-secret")

    const res = await postWebhook("wh-secret", {
      success: true,
      event: "deployment_success",
      message: "deployed",
      application_uuid: "app-1",
      application_name: "web",
      deployment_uuid: "dep-1",
    })

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.received).toBe(true)
    expect(body.eventId).toBeString()

    const [event] = await db.select().from(events).where(eq(events.bridgeId, bridge.id))
    expect(event!.type).toBe("deployment_success")
    expect(event!.severity).toBe("success")
    expect(event!.resourceType).toBe("application")
    expect(event!.resourceId).toBe("app-1")
    expect(event!.metadata).toEqual({ applicationId: "app-1", applicationName: "web", deploymentId: "dep-1" })
  })

  test("stores payload fields outside the schema as metadata", async () => {
    const bridge = await seedBridge("wh-extra")

    const res = await postWebhook("wh-extra", {
      success: false,
      event: "backup_failed",
      message: "Database backup failed",
      database_uuid: "db-1",
      database_name: "postgres",
      error_output: "disk full",
    })

    expect(res.status).toBe(202)
    const [event] = await db.select().from(events).where(eq(events.bridgeId, bridge.id))
    expect(event!.title).toBe("Backup failed")
    expect(event!.resourceType).toBe("database")
    expect(event!.metadata).toEqual({
      databaseId: "db-1",
      databaseName: "postgres",
      errorOutput: "disk full",
    })
  })

  test("normalizes a failed deployment to an error event", async () => {
    const bridge = await seedBridge("wh-fail")

    const res = await postWebhook("wh-fail", {
      success: false,
      event: "deployment_failed",
      message: "boom",
    })

    expect(res.status).toBe(202)
    const [event] = await db.select().from(events).where(eq(events.bridgeId, bridge.id))
    expect(event!.type).toBe("deployment.failed")
    expect(event!.severity).toBe("error")
  })

  test("returns 404 for an unknown secret", async () => {
    const res = await postWebhook("nope", {
      success: true,
      event: "deployment_success",
      message: "x",
    })
    expect(res.status).toBe(404)
  })

  test("returns 404 for a disabled bridge", async () => {
    await seedBridge("disabled-secret", false)

    const res = await postWebhook("disabled-secret", {
      success: true,
      event: "deployment_success",
      message: "x",
    })
    expect(res.status).toBe(404)
  })

  test("rejects a payload that fails validation", async () => {
    await seedBridge("valid-secret")

    const res = await postWebhook("valid-secret", { event: "deployment_success" })
    expect(res.status).toBe(400)
  })
})
