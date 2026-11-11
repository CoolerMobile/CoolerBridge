import { jwtVerify } from "jose"
import type { JWTPayload } from "jose"
import { config } from "@/config"
import { isSignedAfterRotation, keyRotatedAt, resolveCandidateKeys } from "@/auth/keys"
import { CloudPairingAssertion } from "@/auth/assert"

// #region Token Kind
/**
 * @docs The kinds of token CoolerCloud signs for bridges, each bound to its own
 * explicit `typ` header so one kind can never be accepted as another.
 */
export type CloudTokenKind = keyof typeof config.cloud.tokenTypes
// #endregion

// #region Verify Assertion
/**
 * verifies `assertion` against the cloud trust anchors
 *
 * @param assertion the cloud-signed jwt to verify
 * @param kind the kind of token expected, matched against its `typ` header
 *
 * @docs Tries each candidate key the key resolver returns until the signature,
 * token type, issuer, audience, and age all check out, then refuses tokens a
 * rotated key signed after its rotation. Returns the payload, and throws when
 * no trusted key validates the assertion.
 *
 * @returns {Promise<JWTPayload>} the verified claims
 */
export const verifyAssertion = async (assertion: string, kind: CloudTokenKind): Promise<JWTPayload> => {
  const keys = await resolveCandidateKeys(assertion)

  // no trusted key applies to this assertion
  if (keys.length === 0) throw new Error("No cloud verification keys available")

  // try every candidate, remembering the last failure for the throw
  let verified: { payload: JWTPayload; kid?: string } | undefined
  let lastError: unknown
  for (const key of keys) {
    try {
      const { payload, protectedHeader } = await jwtVerify(assertion, key, {
        algorithms: [config.cloud.alg],
        typ: config.cloud.tokenTypes[kind],
        issuer: config.cloud.issuer,
        audience: config.cloud.audience,
        maxTokenAge: config.cloud.maxTokenAge,
        clockTolerance: config.cloud.clockTolerance,
      })

      verified = { payload, kid: protectedHeader.kid }
      break
    } catch (error) {
      lastError = error
    }
  }

  if (!verified) throw lastError ?? new Error("Cloud assertion verification failed")

  // a rotated key only vouches for what it signed before its rotation
  // iat is always present, maxTokenAge requires it
  if (isSignedAfterRotation(verified.payload.iat!, await keyRotatedAt(verified.kid))) {
    throw new Error("Cloud assertion signed by a rotated key")
  }

  return verified.payload
}
// #endregion

// #region Verify Pair Assertion
/**
 * verifies pairing `assertion` against the cloud trust anchors
 *
 * @param assertion assertion to verify
 *
 * @docs Verifies a pairing assertion and returns its normalized claims,
 * including the assertion id (`jti`) CoolerCloud later uses to confirm the
 * pairing with the bridge.
 */
export const verifyPairAssertion = async (assertion: string): Promise<CloudPairingAssertion> => {
  // verify & extract payload
  const payload = await verifyAssertion(assertion, "pair")

  // validate payload data
  if (
    typeof payload.sub !== "string" ||
    typeof payload.bridgeId !== "string" ||
    typeof payload.pairingId !== "string" ||
    typeof payload.jti !== "string" ||
    !payload.jti
  ) {
    throw new Error("Invalid cloud assertion")
  }

  // return normalized assertion
  return {
    cloudUserId: payload.sub,
    cloudBridgeId: payload.bridgeId,
    pairingId: payload.pairingId,
    jti: payload.jti,
  }
}
// #endregion

// #region Verify Cloud Assertion
/**
 * verifies access `assertion` against the cloud trust anchors
 *
 * @param assertion assertion to verify
 *
 * @docs Verifies a cloud access assertion and returns its normalized claims and
 * scopes.
 */
export const verifyCloudAssertion = async (assertion: string) => {
  // verify & extract payload
  const payload = await verifyAssertion(assertion, "access")

  // validate payload data
  if (typeof payload.sub !== "string" || typeof payload.bridgeId !== "string") {
    throw new Error("Invalid access assertion")
  }

  // extract scope from payload
  const scope = Array.isArray(payload.scope)
    ? payload.scope.filter((value): value is string => typeof value === "string")
    : []

  // return normalized assertion
  return {
    cloudUserId: payload.sub,
    cloudBridgeId: payload.bridgeId,
    scope,
  }
}
// #endregion
