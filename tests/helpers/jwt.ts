import { importPKCS8, SignJWT } from "jose"

// signing algorithm, matches the production/dev cloud keys
const alg = "Ed25519"

// issuer and audience the bridge verifies against
const issuer = "https://cloud.getcooler.app"
const audience = "coolerbridge"

/**
 * loads the dev private key used to forge test assertions
 *
 * the matching public key is what auth/cloud verifies with in
 * development mode, so signatures line up
 */
const loadPrivateKey = async () => {
  const pem = await Bun.file(new URL("../../dev/keys/cooler-private.pem", import.meta.url)).text()
  return importPKCS8(pem, alg)
}

type AssertionClaims = {
  sub?: string
  bridgeId?: unknown
  pairingId?: unknown
  scope?: unknown
  issuer?: string
  audience?: string
  expiresIn?: string
}

/**
 * signs a jwt with the dev key, allowing malformed claims so
 * negative cases can be exercised
 *
 * @param claims claim overrides
 */
export const signAssertion = async (claims: AssertionClaims = {}) => {
  const key = await loadPrivateKey()

  const payload: Record<string, unknown> = {}
  if ("bridgeId" in claims) payload.bridgeId = claims.bridgeId
  if ("pairingId" in claims) payload.pairingId = claims.pairingId
  if ("scope" in claims) payload.scope = claims.scope

  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg, typ: "JWT" })
    .setIssuer(claims.issuer ?? issuer)
    .setAudience(claims.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime(claims.expiresIn ?? "5m")

  if (claims.sub !== undefined) jwt = jwt.setSubject(claims.sub)

  return jwt.sign(key)
}

/**
 * convenience: a valid pairing assertion
 *
 * @param pairingId challenge id to bind to
 * @param cloudBridgeId bridge id claim
 */
export const signPairAssertion = (pairingId: string, cloudBridgeId: string) =>
  signAssertion({
    sub: "usr_test",
    bridgeId: cloudBridgeId,
    pairingId,
  })

/**
 * convenience: a valid access assertion
 *
 * @param cloudBridgeId bridge id claim
 * @param scope requested scopes
 */
export const signAccessAssertion = (cloudBridgeId: string, scope: string[]) =>
  signAssertion({
    sub: "usr_test",
    bridgeId: cloudBridgeId,
    scope,
  })
