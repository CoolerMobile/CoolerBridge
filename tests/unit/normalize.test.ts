import { describe, expect, test } from "bun:test"
import { collectMetadata, coolifyEvents, humanizeEvent, normalizeEvent } from "@/services/normalize"
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
    expect(result.metadata).toEqual({ applicationId: "app-1", applicationName: "web", deploymentId: "dep-1" })
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
    expect(result.metadata).toEqual({ applicationId: "app-2", applicationName: "api" })
  })

  test("maps backup_failed to an error database event", () => {
    const result = normalizeEvent(
      base({
        success: false,
        event: "backup_failed",
        message: "Database backup failed",
        database_uuid: "db-1",
        database_name: "postgres",
      })
    )

    expect(result.type).toBe("coolify.backup_failed")
    expect(result.severity).toBe("error")
    expect(result.title).toBe("Backup failed")
    expect(result.resource).toEqual({ id: "db-1", name: "postgres", type: "database" })
  })

  test("maps backup_success to a success database event", () => {
    const result = normalizeEvent(base({ event: "backup_success", message: "Database backup successful" }))

    expect(result.severity).toBe("success")
    expect(result.title).toBe("Backup successful")
    expect(result.resource).toBeUndefined()
  })

  test("maps server events to the server resource", () => {
    const result = normalizeEvent(
      base({ success: false, event: "server_unreachable", server_uuid: "srv-1", server_name: "main" })
    )

    expect(result.severity).toBe("error")
    expect(result.title).toBe("Server unreachable")
    expect(result.resource).toEqual({ id: "srv-1", name: "main", type: "server" })
  })

  test("general event takes its severity from the payload", () => {
    expect(normalizeEvent(base({ success: true, event: "general" })).severity).toBe("info")
    expect(normalizeEvent(base({ success: false, event: "general" })).severity).toBe("error")
  })

  test("never uses a raw identifier as the title of a known event", () => {
    for (const event of Object.keys(coolifyEvents)) {
      expect(normalizeEvent(base({ event })).title).not.toBe(event)
    }
  })

  test("unknown successful event falls back to a readable info event", () => {
    const result = normalizeEvent(base({ success: true, event: "backup_started", message: "hi" }))

    expect(result.type).toBe("coolify.backup_started")
    expect(result.severity).toBe("info")
    expect(result.title).toBe("Backup started")
    expect(result.message).toBe("hi")
    expect(result.resource).toBeUndefined()
  })

  test("unknown failed event falls back to an error event", () => {
    const result = normalizeEvent(base({ success: false, event: "some_new_thing", message: "no" }))

    expect(result.type).toBe("coolify.some_new_thing")
    expect(result.severity).toBe("error")
    expect(result.title).toBe("Some new thing")
  })
})

describe("collectMetadata", () => {
  test("keeps every field beyond the envelope with camel cased keys", () => {
    const metadata = collectMetadata(
      base({
        event: "backup_failed",
        database_uuid: "db-1",
        database_type: "postgresql",
        error_output: "disk full",
        s3_storage_url: "https://s3",
        updates: [{ name: "openssl" }],
        consecutive_failures: 3,
      } as Partial<CoolifyWebhook>)
    )

    expect(metadata).toEqual({
      databaseId: "db-1",
      databaseType: "postgresql",
      errorOutput: "disk full",
      s3StorageUrl: "https://s3",
      updates: [{ name: "openssl" }],
      consecutiveFailures: 3,
    })
  })

  test("drops empty values", () => {
    expect(
      collectMetadata(base({ fqdn: undefined, action: null } as Partial<CoolifyWebhook>))
    ).toBeUndefined()
  })
})

describe("humanizeEvent", () => {
  test("turns separators into spaces and capitalizes", () => {
    expect(humanizeEvent("volume_backup.started")).toBe("Volume backup started")
  })

  test("falls back when nothing readable is left", () => {
    expect(humanizeEvent("__")).toBe("Coolify notification")
  })
})
