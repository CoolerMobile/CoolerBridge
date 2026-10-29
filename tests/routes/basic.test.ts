import { describe, expect, test } from "bun:test"
import app from "@/index"
import { config } from "@/config"

describe("GET /", () => {
  test("reports service status", async () => {
    const res = await app.request("/")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: "CoolerBridge", status: "ok" })
  })
})

describe("GET /health", () => {
  test("returns an ok health payload", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.status).toBe("ok")
    expect(body.service).toBe("coolerbridge")
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow()
  })
})

describe("GET /info", () => {
  test("advertises version and capabilities", async () => {
    const res = await app.request("/info")
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.version).toBe(config.service.version)
    expect(body.apiVersion).toBe(config.service.apiVersion)
    expect(body.capabilities).toEqual([...config.capabilities])
  })
})

describe("unknown route", () => {
  test("returns 404", async () => {
    const res = await app.request("/does-not-exist")
    expect(res.status).toBe(404)
  })
})
