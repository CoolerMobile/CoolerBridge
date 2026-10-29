import { beforeEach, describe, expect, test } from "bun:test"
import app from "@/index"
import { resetDb, seedAuthedSession, seedBridge, seedEvent } from "../helpers/db"

beforeEach(resetDb)

describe("GET /v1/events", () => {
  test("lists the authenticated bridge's events, newest first", async () => {
    const { bridge, token } = await seedAuthedSession(["events:read"])

    const older = await seedEvent(bridge.id, { title: "older" })
    // ensure a distinct, later timestamp
    await Bun.sleep(5)
    const newer = await seedEvent(bridge.id, { title: "newer" })

    const res = await app.request("/v1/events", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].id).toBe(newer.id)
    expect(body[1].id).toBe(older.id)
  })

  test("does not leak another bridge's events", async () => {
    const { token } = await seedAuthedSession(["events:read"])

    // an event owned by an unrelated bridge
    const otherBridge = await seedBridge()
    await seedEvent(otherBridge.id, { title: "secret" })

    const res = await app.request("/v1/events", {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(await res.json()).toHaveLength(0)
  })

  test("requires authentication", async () => {
    const res = await app.request("/v1/events")
    expect(res.status).toBe(401)
  })
})

describe("GET /v1/events/:id", () => {
  test("returns a single event by id", async () => {
    const { bridge, token } = await seedAuthedSession(["events:read"])
    const event = await seedEvent(bridge.id, { title: "one" })

    const res = await app.request(`/v1/events/${event.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe(event.id)
  })

  test("returns 404 for an event owned by a different bridge", async () => {
    const { token } = await seedAuthedSession(["events:read"])
    const otherBridge = await seedBridge()
    const event = await seedEvent(otherBridge.id)

    const res = await app.request(`/v1/events/${event.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(404)
  })

  test("returns 404 for an unknown id", async () => {
    const { token } = await seedAuthedSession(["events:read"])

    const res = await app.request(`/v1/events/${crypto.randomUUID()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(404)
  })
})
