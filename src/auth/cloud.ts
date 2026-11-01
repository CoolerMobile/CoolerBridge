import { importSPKI, jwtVerify } from "jose"
import { CloudPairingAssertion } from "@/auth/assert"

// #region Cloud Public Key
/**
 * @docs Loads the Cooler cloud Ed25519 public key, from the environment in
 * production and from dev keys in development, exiting if none is present.
 */
// encryption algorithm
const alg = "Ed25519"

// public key - env in prod and file in dev
let pubKey
switch (Bun.env.NODE_ENV) {
  case "production": {
    // env files carry the pem on a single line, so restore the newlines before parsing
    const pem = Bun.env.CLOUD_PUBLIC_KEY!.replace(/\\n/g, "\n")
    pubKey = await importSPKI(pem, alg)
    break
  }

  case "development": {
    const pem = await Bun.file(new URL("../../dev/keys/cooler-public.pem", import.meta.url)).text()
    pubKey = await importSPKI(pem, alg)
    break
  }

  default:
    pubKey = null
}

// exit early if key is not present
if (!pubKey) {
  console.error('No public key. Did you run "bun gen:keys"?')
  process.exit(1)
}
// #endregion

// #region Verify Pair Assertion
/**
 * verifies pairing `assertion` against valid public key
 *
 * @param assertion assertion to verify
 *
 * @docs Verifies a pairing assertion against the cloud public key and returns
 * its normalized claims.
 */
export const verifyPairAssertion = async (assertion: string): Promise<CloudPairingAssertion> => {
  // extract & validate payload
  const { payload } = await jwtVerify(assertion, pubKey, {
    algorithms: [alg],
    issuer: "https://cloud.getcooler.app",
    audience: "coolerbridge",
  })

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
 * verifies cloud access assertion against valid public key
 *
 * @param assertion assertion to verify
 *
 * @docs Verifies a cloud access assertion against the cloud public key and
 * returns its normalized claims and scopes.
 */
export const verifyCloudAssertion = async (assertion: string) => {
  // payload
  const { payload } = await jwtVerify(assertion, pubKey, {
    algorithms: [alg],
    issuer: "https://cloud.getcooler.app",
    audience: "coolerbridge",
  })

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
