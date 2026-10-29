import { describe, expect, test } from "bun:test"
import { verifyCloudAssertion, verifyPairAssertion } from "@/auth/cloud"
import { signAssertion } from "../helpers/jwt"

describe("verifyPairAssertion", () => {
  test("returns a normalized assertion for a valid token", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      pairingId: "pair_1",
    })

    const result = await verifyPairAssertion(assertion)

    expect(result).toEqual({
      cloudUserId: "usr_1",
      cloudBridgeId: "cb_1",
      pairingId: "pair_1",
    })
  })

  test("rejects a wrong issuer", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      pairingId: "pair_1",
      issuer: "https://evil.example.com",
    })

    expect(verifyPairAssertion(assertion)).rejects.toThrow()
  })

  test("rejects a wrong audience", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      pairingId: "pair_1",
      audience: "someone-else",
    })

    expect(verifyPairAssertion(assertion)).rejects.toThrow()
  })

  test("rejects an expired token", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      pairingId: "pair_1",
      expiresIn: "-1m",
    })

    expect(verifyPairAssertion(assertion)).rejects.toThrow()
  })

  test("rejects a token missing the pairing id claim", async () => {
    const assertion = await signAssertion({ sub: "usr_1", bridgeId: "cb_1" })
    expect(verifyPairAssertion(assertion)).rejects.toThrow("Invalid cloud assertion")
  })

  test("rejects a token missing the subject", async () => {
    const assertion = await signAssertion({ bridgeId: "cb_1", pairingId: "pair_1" })
    expect(verifyPairAssertion(assertion)).rejects.toThrow("Invalid cloud assertion")
  })

  test("rejects a garbage token", () => {
    expect(verifyPairAssertion("not-a-jwt")).rejects.toThrow()
  })
})

describe("verifyCloudAssertion", () => {
  test("returns normalized data with filtered scopes", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      scope: ["events:read", "devices:write"],
    })

    const result = await verifyCloudAssertion(assertion)

    expect(result).toEqual({
      cloudUserId: "usr_1",
      cloudBridgeId: "cb_1",
      scope: ["events:read", "devices:write"],
    })
  })

  test("coerces a non-array scope claim to an empty list", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      scope: "events:read",
    })

    const result = await verifyCloudAssertion(assertion)
    expect(result.scope).toEqual([])
  })

  test("drops non-string entries from the scope claim", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      scope: ["events:read", 42, null, "devices:read"],
    })

    const result = await verifyCloudAssertion(assertion)
    expect(result.scope).toEqual(["events:read", "devices:read"])
  })

  test("defaults scope to an empty list when absent", async () => {
    const assertion = await signAssertion({ sub: "usr_1", bridgeId: "cb_1" })
    const result = await verifyCloudAssertion(assertion)
    expect(result.scope).toEqual([])
  })

  test("rejects a token missing the bridge id claim", async () => {
    const assertion = await signAssertion({ sub: "usr_1" })
    expect(verifyCloudAssertion(assertion)).rejects.toThrow("Invalid access assertion")
  })

  test("rejects a wrong issuer", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      issuer: "https://evil.example.com",
    })

    expect(verifyCloudAssertion(assertion)).rejects.toThrow()
  })
})
