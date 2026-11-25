import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { isContingencyActive, isRelayEntitled, isRelayGated } from "@/services/contingency"
import { disableChannel, enableChannel, relaySecret, restoreCloud, stubCloud } from "../helpers/cloud"

// silence the failure logger the fail-closed paths hit
let error: ReturnType<typeof spyOn>

beforeEach(() => {
  error = spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  restoreCloud()
  disableChannel()
  delete process.env.CONTINGENCY_FAIL_OPEN
  error.mockRestore()
})

/**
 * a fresh cloud user per check, so the cache never answers for another test
 */
const user = () => ({ cloudUserId: `usr_${crypto.randomUUID()}`, bridgeId: "br_1" })

describe("isRelayEntitled with the relay gate off", () => {
  test("lets everyone through without asking the cloud, so self-hosted bridges stay free", async () => {
    const calls = stubCloud({ relay: false })

    expect(isRelayGated()).toBe(false)
    expect(await isRelayEntitled(user())).toBe(true)

    // even with the status channel configured for contingency
    enableChannel({ gated: false })
    expect(await isRelayEntitled(user())).toBe(true)
    expect(calls).toHaveLength(0)
  })
})

describe("isRelayEntitled on the hosted relay", () => {
  beforeEach(() => enableChannel())

  test("lets an entitled user through, asking with the relay secret", async () => {
    const calls = stubCloud({ contingency: false, relay: true })

    expect(await isRelayEntitled(user())).toBe(true)
    expect(calls[0]!.authorization).toBe(`Bearer ${relaySecret}`)
  })

  test("refuses a free, cancelled or past due user, which the cloud reports as not entitled", async () => {
    stubCloud({ contingency: false, relay: false })
    expect(await isRelayEntitled(user())).toBe(false)
  })

  test("refuses when the cloud predates the relay claim", async () => {
    stubCloud({ contingency: false })
    expect(await isRelayEntitled(user())).toBe(false)
  })

  test("fails closed when the cloud is unreachable or refuses", async () => {
    stubCloud("down")
    expect(await isRelayEntitled(user())).toBe(false)

    stubCloud(500)
    expect(await isRelayEntitled(user())).toBe(false)
  })

  test("fails closed on a reply the bridge can't trust", async () => {
    stubCloud("untrusted")
    expect(await isRelayEntitled(user())).toBe(false)

    // a genuine answer, but about someone else
    stubCloud(() => ({ sub: "usr_other", relay: true }))
    expect(await isRelayEntitled(user())).toBe(false)
  })

  test("fails closed even when contingency is set to fail open", async () => {
    process.env.CONTINGENCY_FAIL_OPEN = "true"
    stubCloud("down")

    const params = user()
    expect(await isContingencyActive(params)).toBe(false)
    expect(await isRelayEntitled(params)).toBe(false)
  })

  test("fails closed when the status channel isn't configured", async () => {
    const calls = stubCloud({ relay: true })
    delete process.env.CLOUD_STATUS_URL

    expect(await isRelayEntitled(user())).toBe(false)
    expect(calls).toHaveLength(0)
  })

  test("shares one round trip and cache with the contingency check", async () => {
    enableChannel({ ttlMs: 10_000 })
    const calls = stubCloud({ contingency: false, relay: true })

    const params = user()
    expect(await isContingencyActive(params)).toBe(false)
    expect(await isRelayEntitled(params)).toBe(true)
    expect(await isRelayEntitled(params)).toBe(true)
    expect(calls).toHaveLength(1)
  })
})

describe("isContingencyActive", () => {
  test("still reads the contingency claim alongside the relay claim", async () => {
    enableChannel()
    stubCloud({ contingency: true, relay: true })

    expect(await isContingencyActive(user())).toBe(true)
  })
})
