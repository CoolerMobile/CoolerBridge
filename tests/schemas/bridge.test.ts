import { describe, expect, test } from "bun:test"
import { completePairingSchema } from "@/schemas/bridge"

describe("completePairingSchema", () => {
  test("accepts a code and assertion pair", () => {
    const result = completePairingSchema.safeParse({
      code: "ABCD-EFGH",
      assertion: "jwt.token.here",
    })

    expect(result.success).toBe(true)
  })

  test("rejects a missing assertion", () => {
    expect(completePairingSchema.safeParse({ code: "ABCD-EFGH" }).success).toBe(false)
  })

  test("rejects a missing code", () => {
    expect(completePairingSchema.safeParse({ assertion: "x" }).success).toBe(false)
  })

  test("rejects non-string values", () => {
    expect(completePairingSchema.safeParse({ code: 1, assertion: 2 }).success).toBe(false)
  })
})
