import { beforeEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import app from "@/index"
import { db } from "@/db"
import { bridges } from "@/db/schema"
import { resetDb } from "../helpers/db"

beforeEach(resetDb)

describe("POST /v1/bridges", () => {
  test("creates a bridge and returns its webhook url", async () => {
    const res = await app.request("/v1/bridges", { method: "POST" })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.name).toBe("Coolify")
    expect(body.webhookUrl).toMatch(/^\/v1\/webhooks\/coolify\/[A-Za-z0-9_-]+$/)

    // the row is persisted with a secret that is not leaked in the body
    const [row] = await db.select().from(bridges).where(eq(bridges.id, body.id))
    expect(row).toBeDefined()
    expect(body).not.toHaveProperty("secret")
  })

  test("each call creates a distinct bridge", async () => {
    const a = await (await app.request("/v1/bridges", { method: "POST" })).json()
    const b = await (await app.request("/v1/bridges", { method: "POST" })).json()

    expect(a.id).not.toBe(b.id)
    expect(a.webhookUrl).not.toBe(b.webhookUrl)
  })
})
