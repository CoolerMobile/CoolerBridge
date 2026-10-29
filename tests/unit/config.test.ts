import { describe, expect, test } from "bun:test"
import { config } from "@/config"
import { version } from "../../package.json"

describe("config", () => {
  test("exposes the service identity", () => {
    expect(config.service.name).toBe("CoolerBridge")
    expect(config.service.apiVersion).toBe(1)
  })

  test("reports the package version", () => {
    expect(config.service.version).toBe(version)
  })

  test("advertises its capabilities", () => {
    expect(config.capabilities).toContain("coolify-webhooks")
    expect(config.capabilities).toContain("events")
  })

  test("defines a server port", () => {
    expect(config.server.port).toBe(3000)
  })
})
