import { describe, expect, test } from "bun:test"
import { coolifyWebhookSchema } from "@/schemas/coolify"

describe("coolifyWebhookSchema", () => {
  test("accepts a minimal payload", () => {
    const result = coolifyWebhookSchema.safeParse({
      success: true,
      event: "deployment_success",
      message: "done",
    })

    expect(result.success).toBe(true)
  })

  test("accepts optional event-specific fields", () => {
    const result = coolifyWebhookSchema.safeParse({
      success: false,
      event: "deployment_failed",
      message: "failed",
      application_name: "web",
      application_uuid: "app-1",
      deployment_uuid: "dep-1",
      fqdn: "example.com",
    })

    expect(result.success).toBe(true)
  })

  test("rejects a missing required field", () => {
    const result = coolifyWebhookSchema.safeParse({
      event: "deployment_success",
      message: "done",
    })

    expect(result.success).toBe(false)
  })

  test("rejects wrong types", () => {
    const result = coolifyWebhookSchema.safeParse({
      success: "yes",
      event: 1,
      message: null,
    })

    expect(result.success).toBe(false)
  })

  test("strips unknown keys by default", () => {
    const parsed = coolifyWebhookSchema.parse({
      success: true,
      event: "x",
      message: "y",
      not_a_field: "dropped",
    })

    expect(parsed).not.toHaveProperty("not_a_field")
  })
})
