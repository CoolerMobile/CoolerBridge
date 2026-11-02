import { createRemoteJWKSet, decodeProtectedHeader, importSPKI } from "jose"
import type { JWSHeaderParameters } from "jose"
import { config } from "@/config"
import { cloudAnchors } from "@/auth/anchors"

// signing algorithm, shared with the rest of the cloud auth layer
const alg = config.cloud.alg

// #region Resolved Anchor
/**
 * @docs A trust anchor whose pem has been imported into a usable key. the `kid`
 * mirrors the source anchor and, when undefined, marks a wildcard tried for any
 * assertion.
 */
type ResolvedAnchor = {
  kid?: string
  key: CryptoKey
}
// #endregion

// #region Import Anchor
/**
 * imports a single pem into a resolved anchor
 *
 * @param pem Ed25519 public key in SPKI PEM form
 * @param kid optional key id carried by matching assertions
 *
 * @docs Imports an anchor pem, tolerating env files that keep the pem on a
 * single line with escaped newlines. invalid pems are skipped rather than
 * thrown so one bad anchor can't take the whole bridge down.
 *
 * @returns {Promise<ResolvedAnchor | null>} the anchor, or null when invalid
 */
const importAnchor = async (pem: string, kid?: string): Promise<ResolvedAnchor | null> => {
  try {
    const key = await importSPKI(pem.replace(/\\n/g, "\n").trim(), alg)
    return { kid, key }
  } catch (error) {
    console.error("skipping invalid cloud anchor:", error)
    return null
  }
}
// #endregion

// #region Local Anchors
/**
 * @docs Builds the local trust anchors for the current environment: a
 * CLOUD_PUBLIC_KEY override or the baked CoolerCloud keys in production, and the
 * generated dev key in development. the dev key is a wildcard so dev and test
 * assertions verify regardless of any `kid`.
 */
const buildLocalAnchors = async (): Promise<ResolvedAnchor[]> => {
  switch (Bun.env.NODE_ENV) {
    case "production": {
      // optional override for development and testing, replaces the baked anchors
      const override = Bun.env.CLOUD_PUBLIC_KEY?.trim()
      if (override) {
        const resolved = await importAnchor(override)
        return resolved ? [resolved] : []
      }

      // baked anchors shipped with the image
      const resolved = await Promise.all(cloudAnchors.map((anchor) => importAnchor(anchor.pem, anchor.kid)))
      return resolved.filter((anchor): anchor is ResolvedAnchor => anchor !== null)
    }

    case "development": {
      // dev key from `bun gen:keys`, acts as a wildcard anchor
      const pem = await Bun.file(new URL("../../dev/keys/cooler-public.pem", import.meta.url)).text()
      const resolved = await importAnchor(pem)
      return resolved ? [resolved] : []
    }

    default:
      return []
  }
}

const localAnchors = await buildLocalAnchors()
// #endregion

// #region Remote Key Set
/**
 * @docs Jwks discovery used to pick up rotated cloud keys. enabled only in
 * production and only when a jwks url is configured, so development and tests
 * never reach out over the network. the baked anchors stay the offline root of
 * trust; discovery only extends it to newly published keys over tls.
 */
const remoteJWKS =
  Bun.env.NODE_ENV === "production" && config.cloud.jwksUrl
    ? createRemoteJWKSet(new URL(config.cloud.jwksUrl))
    : null
// #endregion

// #region Trust Guard
/**
 * @docs Fails fast when there is no way to verify assertions. in production
 * that means neither baked anchors, an override, nor discovery; in development
 * it is almost always a missing dev key.
 */
if (Bun.env.NODE_ENV === "production") {
  if (localAnchors.length === 0 && !remoteJWKS) {
    console.error("No cloud trust anchors. Set CLOUD_PUBLIC_KEY or CLOUD_JWKS_URL, or ship baked anchors.")
    process.exit(1)
  }

  if (localAnchors.length === 0) {
    console.warn(
      "No baked cloud anchors; relying on jwks discovery only. Offline verification is unavailable."
    )
  }
}

if (Bun.env.NODE_ENV === "development" && localAnchors.length === 0) {
  console.error('No cloud dev key. Did you run "bun gen:keys"?')
  process.exit(1)
}
// #endregion

// #region Resolve Candidate Keys
/**
 * resolves the keys that could have signed `token`
 *
 * @param token the assertion whose header selects the keys
 *
 * @docs Picks the keys to try for an assertion. local anchors come first so the
 * common path stays offline: an exact `kid` match, plus any wildcard anchors,
 * or every anchor when the token carries no `kid`. when a token presents a `kid`
 * no local anchor claims, jwks discovery is consulted to pick up a rotated key.
 *
 * @returns {Promise<CryptoKey[]>} candidate keys, most likely first
 */
export const resolveCandidateKeys = async (token: string): Promise<CryptoKey[]> => {
  // read the header without verifying, to learn the kid
  let header: JWSHeaderParameters
  try {
    header = decodeProtectedHeader(token) as JWSHeaderParameters
  } catch {
    return []
  }

  const kid = header.kid

  // local anchors: exact kid match or wildcard, and all of them when no kid
  const local = localAnchors
    .filter((anchor) => !kid || anchor.kid === kid || anchor.kid === undefined)
    .map((anchor) => anchor.key)

  // whether a local anchor claims this exact kid
  const hasExactLocal = kid !== undefined && localAnchors.some((anchor) => anchor.kid === kid)

  const keys = [...local]

  // consult discovery for an unknown kid, so rotated keys are picked up
  if (remoteJWKS && kid !== undefined && !hasExactLocal) {
    try {
      keys.push(await remoteJWKS(header))
    } catch (error) {
      console.error("jwks discovery failed:", error)
    }
  }

  return keys
}
// #endregion
