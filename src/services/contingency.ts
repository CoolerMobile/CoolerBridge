import { compactDecrypt, exportJWK, generateKeyPair } from "jose"
import { verifyAssertion } from "@/auth/cloud"

// #region Config
/**
 * @docs Reads the status channel settings: the status endpoint, the shared
 * relay secret, whether to keep operating when the cloud is unreachable, how
 * long a confirmed result is cached, and whether this bridge is the hosted
 * relay, which only serves accounts holding the relay plan. Read on every
 * check, so a change applies without reloading the module.
 */
const settings = () => ({
  statusUrl: Bun.env.CLOUD_STATUS_URL,
  relaySecret: Bun.env.BRIDGE_RELAY_SECRET,
  failOpen: Bun.env.CONTINGENCY_FAIL_OPEN === "true",
  ttlMs: Number(Bun.env.CONTINGENCY_TTL_MS ?? 10_000),
  requireRelay: Bun.env.REQUIRE_RELAY_ENTITLEMENT === "true",
})
// #endregion

// #region Status
/**
 * @docs A cloud user's status as the cloud confirmed it: whether their moat is
 * up, and whether they hold the relay plan.
 */
type CloudStatus = {
  contingency: boolean
  relay: boolean
}
// #endregion

// #region Cache
/**
 * @docs Short-lived cache of confirmed results, keyed by cloud user, so the
 * hot paths don't hit the cloud on every request, and the contingency and
 * relay checks share a single round trip.
 */
const cache = new Map<string, { status: CloudStatus; expiresAt: number }>()
// #endregion

// #region Fail Safe
/**
 * @docs Picks the contingency state to assume when the cloud can't be reached
 * or its reply can't be trusted: the moat stays up unless the operator opted
 * into fail-open.
 */
const failSafe = () => !settings().failOpen
// #endregion

// #region Status Check
/**
 * asks the cloud for a cloud user's status, in real time
 *
 * @param params cloud user and bridge to check
 *
 * @docs Asks the cloud over an end-to-end encrypted channel: it sends an
 * ephemeral X25519 key, the cloud seals a signed status token to it, and the
 * bridge decrypts and verifies it against the cloud trust anchors. Confirmed
 * results are cached briefly.
 *
 * @returns {Promise<CloudStatus | null>} the confirmed status, or null when it can't be confirmed
 */
const fetchStatus = async (params: {
  cloudUserId: string
  bridgeId: string
}): Promise<CloudStatus | null> => {
  const { statusUrl, relaySecret, ttlMs } = settings()

  // nothing to ask without a configured channel
  if (!statusUrl || !relaySecret) return null

  // serve a fresh cached result
  const cached = cache.get(params.cloudUserId)
  if (cached && cached.expiresAt > Date.now()) return cached.status

  try {
    // ephemeral x25519 keypair, the cloud seals its reply to the public half
    const { publicKey, privateKey } = await generateKeyPair("ECDH-ES", {
      crv: "X25519",
      extractable: true,
    })
    const epk = await exportJWK(publicKey)

    // ask the cloud
    const res = await fetch(statusUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${relaySecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cloudUserId: params.cloudUserId,
        bridgeId: params.bridgeId,
        epk,
      }),
    })
    if (!res.ok) return null

    // sealed status token
    const { token } = (await res.json()) as { token?: string }
    if (!token) return null

    // decrypt the sealed reply, then verify the inner token against the cloud
    // trust anchors, the same way assertions are verified (signature, status typ, issuer, audience, age)
    const { plaintext } = await compactDecrypt(token, privateKey)
    const jws = new TextDecoder().decode(plaintext)
    const payload = await verifyAssertion(jws, "status")

    // bind the answer to the user we asked about
    if (payload.sub !== params.cloudUserId) return null

    // cache and return the confirmed state
    // clouds that predate the relay claim leave it out, which reads as not entitled
    const status = { contingency: payload.contingency === true, relay: payload.relay === true }
    cache.set(params.cloudUserId, { status, expiresAt: Date.now() + ttlMs })
    return status
  } catch (error) {
    console.error("Cloud status check failed:", error)
    return null
  }
}
// #endregion

// #region Contingency Check
/**
 * checks whether a cloud user's moat is up, in real time
 *
 * @param params cloud user and bridge to check
 *
 * @returns whether bridges for this user are paused
 *
 * @docs Checks a cloud user's contingency state through the status channel.
 * Returns true (paused) whenever the state can't be confirmed, unless
 * fail-open is set.
 */
export const isContingencyActive = async (params: {
  cloudUserId: string
  bridgeId: string
}): Promise<boolean> => {
  // feature stays off until the channel is configured, bridges operate normally
  const { statusUrl, relaySecret } = settings()
  if (!statusUrl || !relaySecret) return false

  const status = await fetchStatus(params)
  return status ? status.contingency : failSafe()
}
// #endregion

// #region Relay Gate
/**
 * whether this bridge is the hosted relay, serving only relay plan holders
 *
 * @docs True when REQUIRE_RELAY_ENTITLEMENT is set, which only the hosted relay
 * does. Self-hosted bridges leave it unset and stay free.
 *
 * @returns {boolean} whether the relay plan is required
 */
export const isRelayGated = (): boolean => settings().requireRelay
// #endregion

// #region Relay Entitlement Check
/**
 * checks whether a cloud user may use this bridge, in real time
 *
 * @param params cloud user and bridge to check
 *
 * @returns whether the user may use this bridge
 *
 * @docs Always true on a self-hosted bridge. On the hosted relay, asks the
 * cloud whether the user holds the relay plan, sharing the contingency round
 * trip and cache. Fails closed: when the cloud can't confirm it, the user is
 * treated as not entitled, whatever the contingency fail-open setting.
 */
export const isRelayEntitled = async (params: {
  cloudUserId: string
  bridgeId: string
}): Promise<boolean> => {
  if (!isRelayGated()) return true

  const status = await fetchStatus(params)
  return status?.relay === true
}
// #endregion
