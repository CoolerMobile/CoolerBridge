import { describe, expect, test } from "bun:test"
import { normalizeEvent } from "@/services/normalize"
import type { CoolifyWebhook } from "@/schemas/coolify"

const base = (overrides: Partial<CoolifyWebhook> = {}): CoolifyWebhook => ({
  success: true,
  event: "deployment_success",
  message: "deployed",
  ...overrides,
})

describe("normalizeEvent", () => {
  test("maps deployment_success to a success application event", () => {
    const result = normalizeEvent(
      base({
        event: "deployment_success",
        message: "it worked",
        application_uuid: "app-1",
        application_name: "web",
        deployment_uuid: "dep-1",
      })
    )

    expect(result.type).toBe("deployment_success")
    expect(result.severity).toBe("success")
    expect(result.title).toBe("Deployment successful")
    expect(result.message).toBe("it worked")
    expect(result.resource).toEqual({ id: "app-1", name: "web", type: "application" })
    expect(result.metadata).toEqual({ deploymentId: "dep-1" })
    expect(() => new Date(result.createdAt).toISOString()).not.toThrow()
  })

  test("maps deployment_failed to an error application event", () => {
    const result = normalizeEvent(
      base({
        success: false,
        event: "deployment_failed",
        message: "boom",
        application_uuid: "app-2",
        application_name: "api",
      })
    )

    expect(result.type).toBe("deployment.failed")
    expect(result.severity).toBe("error")
    expect(result.title).toBe("Deployment failed")
    expect(result.message).toBe("boom")
    expect(result.resource).toEqual({ id: "app-2", name: "api", type: "application" })
    expect(result.metadata).toBeUndefined()
  })

  test("unknown successful event falls back to an info event", () => {
    const result = normalizeEvent(base({ success: true, event: "backup_started", message: "hi" }))

    expect(result.type).toBe("coolify.backup_started")
    expect(result.severity).toBe("info")
    expect(result.title).toBe("backup_started")
    expect(result.message).toBe("hi")
    expect(result.resource).toBeUndefined()
  })

  test("unknown failed event falls back to an error event", () => {
    const result = normalizeEvent(base({ success: false, event: "backup_failed", message: "no" }))

    expect(result.type).toBe("coolify.backup_failed")
    expect(result.severity).toBe("error")
  })
})
