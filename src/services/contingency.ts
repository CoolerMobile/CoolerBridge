import { compactDecrypt, exportJWK, generateKeyPair } from "jose"
import { verifyAssertion } from "@/auth/cloud"

// #region Config
/**
 * @docs Reads the contingency channel settings: the status endpoint, the shared
 * relay secret, whether to keep operating when the cloud is unreachable, and how
 * long a confirmed result is cached.
 */
const STATUS_URL = Bun.env.CLOUD_STATUS_URL
const RELAY_SECRET = Bun.env.BRIDGE_RELAY_SECRET
const FAIL_OPEN = Bun.env.CONTINGENCY_FAIL_OPEN === "true"
const TTL_MS = Number(Bun.env.CONTINGENCY_TTL_MS ?? 10_000)
// #endregion

// #region Cache
/**
 * @docs Short-lived cache of confirmed results, keyed by cloud user, so the
 * hot paths don't hit the cloud on every request.
 */
const cache = new Map<string, { active: boolean; expiresAt: number }>()
// #endregion

// #region Fail Safe
/**
 * @docs Picks the state to assume when the cloud can't be reached or its reply
 * can't be trusted: the moat stays up unless the operator opted into fail-open.
 */
const failSafe = () => !FAIL_OPEN
// #endregion

// #region Contingency Check
/**
 * checks whether a cloud user's moat is up, in real time
 *
 * @param params cloud user and bridge to check
 *
 * @returns whether bridges for this user are paused
 *
 * @docs Checks a cloud user's contingency state over an end-to-end encrypted
 * channel: it sends an ephemeral X25519 key, the cloud seals a signed status
 * token to it, and the bridge decrypts and verifies it against the cloud trust
 * anchors. Returns true (paused) whenever the state can't be confirmed, unless
 * fail-open is set.
 */
export const isContingencyActive = async (params: {
  cloudUserId: string
  bridgeId: string
}): Promise<boolean> => {
  // feature stays off until the channel is configured, bridges operate normally
  if (!STATUS_URL || !RELAY_SECRET) return false

  // serve a fresh cached result
  const cached = cache.get(params.cloudUserId)
  if (cached && cached.expiresAt > Date.now()) return cached.active

  try {
    // ephemeral x25519 keypair, the cloud seals its reply to the public half
    const { publicKey, privateKey } = await generateKeyPair("ECDH-ES", {
      crv: "X25519",
      extractable: true,
    })
    const epk = await exportJWK(publicKey)

    // ask the cloud
    const res = await fetch(STATUS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RELAY_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cloudUserId: params.cloudUserId,
        bridgeId: params.bridgeId,
        epk,
      }),
    })
    if (!res.ok) return failSafe()

    // sealed status token
    const { token } = (await res.json()) as { token?: string }
    if (!token) return failSafe()

    // decrypt the sealed reply, then verify the inner token against the cloud
    // trust anchors, the same way assertions are verified (signature, issuer, audience)
    const { plaintext } = await compactDecrypt(token, privateKey)
    const jws = new TextDecoder().decode(plaintext)
    const payload = await verifyAssertion(jws)

    // bind the answer to the user we asked about
    if (payload.sub !== params.cloudUserId) return failSafe()

    // cache and return the confirmed state
    const active = payload.contingency === true
    cache.set(params.cloudUserId, { active, expiresAt: Date.now() + TTL_MS })
    return active
  } catch (error) {
    console.error("Contingency check failed:", error)
    return failSafe()
  }
}
// #endregion
