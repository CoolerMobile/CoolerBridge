import { describe, expect, test } from "bun:test"
import { randomString } from "@/lib/utils"

// crockford-style alphabet used by the generator
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

describe("randomString", () => {
  test("respects the requested length", () => {
    expect(randomString(0)).toHaveLength(0)
    expect(randomString(8)).toHaveLength(8)
    expect(randomString(64)).toHaveLength(64)
  })

  test("only uses the allowed alphabet", () => {
    const value = randomString(200)
    for (const char of value) {
      expect(ALPHABET).toContain(char)
    }
  })

  test("is effectively unique across calls", () => {
    const values = new Set(Array.from({ length: 100 }, () => randomString(16)))
    expect(values.size).toBe(100)
  })
})
