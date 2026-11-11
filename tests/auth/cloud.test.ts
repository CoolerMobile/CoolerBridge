import { describe, expect, test } from "bun:test"
import { verifyCloudAssertion, verifyPairAssertion } from "@/auth/cloud"
import { isSignedAfterRotation, resolveCandidateKeys, rotatedAtFrom } from "@/auth/keys"
import { signAssertion, signUntrustedAssertion, tokenTypes } from "../helpers/jwt"

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
    const assertion = await signAssertion({ sub: "usr_1", bridgeId: "cb_1", typ: tokenTypes.pair })
    expect(verifyPairAssertion(assertion)).rejects.toThrow("Invalid cloud assertion")
  })

  test("rejects an access assertion presented for pairing", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      pairingId: "pair_1",
      typ: tokenTypes.access,
    })
    expect(verifyPairAssertion(assertion)).rejects.toThrow('unexpected "typ"')
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

  test("rejects a pairing assertion presented for access", async () => {
    const assertion = await signAssertion({ sub: "usr_1", bridgeId: "cb_1", pairingId: "pair_1" })
    expect(verifyCloudAssertion(assertion)).rejects.toThrow('unexpected "typ"')
  })

  test("rejects a contingency status token presented for access", async () => {
    const assertion = await signAssertion({ sub: "usr_1", bridgeId: "cb_1", typ: tokenTypes.status })
    expect(verifyCloudAssertion(assertion)).rejects.toThrow('unexpected "typ"')
  })

  test("rejects an untyped jwt", async () => {
    const assertion = await signAssertion({ sub: "usr_1", bridgeId: "cb_1", typ: "JWT" })
    expect(verifyCloudAssertion(assertion)).rejects.toThrow('unexpected "typ"')
  })

  test("rejects a token older than the maximum age, even when not expired", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      issuedAt: Math.floor(Date.now() / 1000) - 60 * 60,
      expiresIn: "1h",
    })
    expect(verifyCloudAssertion(assertion)).rejects.toThrow()
  })

  test("tolerates a cloud clock slightly ahead", async () => {
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      issuedAt: Math.floor(Date.now() / 1000) + 10,
    })
    expect((await verifyCloudAssertion(assertion)).cloudUserId).toBe("usr_1")
  })
})

describe("key rotation", () => {
  const published = {
    keys: [
      { kty: "OKP", crv: "Ed25519", x: "new", kid: "cloud-2027", status: "active" },
      { kty: "OKP", crv: "Ed25519", x: "old", kid: "cloud-2026", status: "rotated", rotated_at: 1_000 },
      { kty: "OKP", crv: "Ed25519", x: "bad", kid: "cloud-2025", status: "rotated" },
    ],
  }

  test("reads the rotation time of a rotated key", () => {
    expect(rotatedAtFrom(published, "cloud-2026")).toBe(1_000)
  })

  test("treats active and unknown keys as not rotated", () => {
    expect(rotatedAtFrom(published, "cloud-2027")).toBeUndefined()
    expect(rotatedAtFrom(published, "cloud-1999")).toBeUndefined()
    expect(rotatedAtFrom(undefined, "cloud-2026")).toBeUndefined()
    expect(rotatedAtFrom(published, undefined)).toBeUndefined()
  })

  test("treats a rotated key without a time as rotated since the epoch", () => {
    expect(rotatedAtFrom(published, "cloud-2025")).toBe(0)
  })

  test("accepts tokens a rotated key signed before its rotation", () => {
    expect(isSignedAfterRotation(999, 1_000)).toBe(false)
    expect(isSignedAfterRotation(1_000, 1_000)).toBe(false)
  })

  test("refuses tokens a rotated key signed after its rotation", () => {
    expect(isSignedAfterRotation(1_001, 1_000)).toBe(true)
  })

  test("never refuses tokens from an active key", () => {
    expect(isSignedAfterRotation(1_001, undefined)).toBe(false)
  })
})

describe("trust anchors", () => {
  test("rejects an assertion signed by an untrusted key", async () => {
    const assertion = await signUntrustedAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      pairingId: "pair_1",
    })

    expect(verifyPairAssertion(assertion)).rejects.toThrow()
  })

  test("verifies a well-formed assertion that carries a kid", async () => {
    // the dev anchor is a wildcard, so a kid never blocks a valid signature
    const assertion = await signAssertion({
      sub: "usr_1",
      bridgeId: "cb_1",
      pairingId: "pair_1",
      kid: "cloud-2026",
    })

    const result = await verifyPairAssertion(assertion)

    expect(result).toEqual({
      cloudUserId: "usr_1",
      cloudBridgeId: "cb_1",
      pairingId: "pair_1",
    })
  })

  test("resolves the wildcard dev anchor for a token with a kid", async () => {
    const assertion = await signAssertion({ sub: "usr_1", bridgeId: "cb_1", kid: "cloud-2026" })
    const keys = await resolveCandidateKeys(assertion)

    expect(keys.length).toBe(1)
  })

  test("resolves no keys for a garbage token", async () => {
    const keys = await resolveCandidateKeys("not-a-jwt")
    expect(keys).toEqual([])
  })
})
