import { jwtVerify } from "jose"
import type { JWTPayload } from "jose"
import { config } from "@/config"
import { resolveCandidateKeys } from "@/auth/keys"
import { CloudPairingAssertion } from "@/auth/assert"

// #region Verify Assertion
/**
 * verifies `assertion` against the cloud trust anchors
 *
 * @param assertion the cloud-signed jwt to verify
 *
 * @docs Tries each candidate key the key resolver returns until the signature,
 * issuer, and audience all check out, then returns the payload. throws when no
 * trusted key validates the assertion.
 *
 * @returns {Promise<JWTPayload>} the verified claims
 */
const verifyAssertion = async (assertion: string): Promise<JWTPayload> => {
  const keys = await resolveCandidateKeys(assertion)

  // no trusted key applies to this assertion
  if (keys.length === 0) throw new Error("No cloud verification keys available")

  // try every candidate, remembering the last failure for the throw
  let lastError: unknown
  for (const key of keys) {
    try {
      const { payload } = await jwtVerify(assertion, key, {
        algorithms: [config.cloud.alg],
        issuer: config.cloud.issuer,
        audience: config.cloud.audience,
      })

      return payload
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error("Cloud assertion verification failed")
}
// #endregion

// #region Verify Pair Assertion
/**
 * verifies pairing `assertion` against the cloud trust anchors
 *
 * @param assertion assertion to verify
 *
 * @docs Verifies a pairing assertion and returns its normalized claims.
 */
export const verifyPairAssertion = async (assertion: string): Promise<CloudPairingAssertion> => {
  // verify & extract payload
  const payload = await verifyAssertion(assertion)

  // validate payload data
  if (
    typeof payload.sub !== "string" ||
    typeof payload.bridgeId !== "string" ||
    typeof payload.pairingId !== "string"
  ) {
    throw new Error("Invalid cloud assertion")
  }

  // return normalized assertion
  return {
    cloudUserId: payload.sub,
    cloudBridgeId: payload.bridgeId,
    pairingId: payload.pairingId,
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
  const payload = await verifyAssertion(assertion)

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
