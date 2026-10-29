import { describe, expect, test } from "bun:test"
import { codeDigest, generateCode, generateSessionToken, tokenDigest } from "@/auth/utils"

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

describe("generateCode", () => {
  test("matches the ABCD-ABCD shape", () => {
    expect(generateCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  test("only uses the allowed alphabet", () => {
    const code = generateCode().replace("-", "")
    for (const char of code) {
      expect(ALPHABET).toContain(char)
    }
  })

  test("is effectively unique", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateCode()))
    expect(codes.size).toBe(100)
  })
})

describe("codeDigest", () => {
  test("is deterministic for the same code", () => {
    expect(codeDigest("ABCD-EFGH")).toBe(codeDigest("ABCD-EFGH"))
  })

  test("returns a 64 char hex digest", () => {
    expect(codeDigest("ABCD-EFGH")).toMatch(/^[0-9a-f]{64}$/)
  })

  test("normalizes case, whitespace and dashes", () => {
    const canonical = codeDigest("ABCD-EFGH")
    expect(codeDigest("  abcd-efgh  ")).toBe(canonical)
    expect(codeDigest("abcdefgh")).toBe(canonical)
    expect(codeDigest("AB-CD-EF-GH")).toBe(canonical)
  })

  test("different codes produce different digests", () => {
    expect(codeDigest("ABCD-EFGH")).not.toBe(codeDigest("ABCD-EFGJ"))
  })
})

describe("generateSessionToken", () => {
  test("is prefixed with cbt_ and url-safe", () => {
    const token = generateSessionToken()
    expect(token.startsWith("cbt_")).toBe(true)
    expect(token.slice(4)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test("is unique across calls", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()))
    expect(tokens.size).toBe(100)
  })
})

describe("tokenDigest", () => {
  test("is deterministic", () => {
    expect(tokenDigest("cbt_abc")).toBe(tokenDigest("cbt_abc"))
  })

  test("returns a 64 char hex digest", () => {
    expect(tokenDigest("cbt_abc")).toMatch(/^[0-9a-f]{64}$/)
  })

  test("differs for different tokens", () => {
    expect(tokenDigest("cbt_abc")).not.toBe(tokenDigest("cbt_abd"))
  })
})
