import { describe, expect, test } from "bun:test"
import { genSecret } from "@/services/secrets"

describe("genSecret", () => {
  test("produces a url-safe base64 string", () => {
    const secret = genSecret()

    // base64url alphabet only, no padding
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test("encodes 32 bytes", () => {
    // 32 bytes base64url -> 43 chars
    expect(genSecret()).toHaveLength(43)
  })

  test("is unique across calls", () => {
    const secrets = new Set(Array.from({ length: 100 }, () => genSecret()))
    expect(secrets.size).toBe(100)
  })
})
