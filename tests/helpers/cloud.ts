import { CompactEncrypt, importJWK } from "jose"
import type { JWK } from "jose"
import { signAssertion, signUntrustedAssertion, tokenTypes } from "./jwt"

/**
 * stand-in for the CoolerCloud status endpoint
 *
 * answers the bridge's status requests the way the cloud does, with a status
 * token signed by the dev key and sealed to the bridge's ephemeral key, so the
 * real verification path runs end to end
 */

// where the bridge is pointed, never a real cloud
export const statusUrl = "https://cloud.test/api/bridges/status"
export const relaySecret = "relay-secret-test"

/**
 * how the fake cloud answers
 *
 * a status, or one built per cloud user (which may answer about someone else),
 * "down" to fail the request, "untrusted" to sign with a key the bridge doesn't
 * trust, or an http status to refuse with
 */
type CloudStatus = { contingency?: boolean; relay?: boolean; sub?: string }
type CloudReply = CloudStatus | "down" | "untrusted" | number | ((cloudUserId: string) => CloudStatus)

/**
 * seals a signed status token to the bridge's ephemeral key
 *
 * @param token signed status token
 * @param epk the bridge's ephemeral public key
 */
const seal = async (token: string, epk: JWK) => {
  const recipient = await importJWK({ kty: "OKP", crv: "X25519", x: epk.x }, "ECDH-ES")
  return new CompactEncrypt(new TextEncoder().encode(token))
    .setProtectedHeader({ alg: "ECDH-ES", enc: "A256GCM", cty: "JWT" })
    .encrypt(recipient)
}

const realFetch = globalThis.fetch

/**
 * swaps global fetch for the fake cloud, returning the requests it receives
 *
 * @param reply how the cloud answers
 *
 * @returns {{ cloudUserId: string; authorization: string | null }[]} the recorded requests
 */
export const stubCloud = (reply: CloudReply) => {
  const calls: { cloudUserId: string; authorization: string | null }[] = []

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== statusUrl) throw new Error(`unexpected request to ${input}`)

    const body = JSON.parse(String(init?.body)) as { cloudUserId: string; bridgeId: string; epk: JWK }
    calls.push({
      cloudUserId: body.cloudUserId,
      authorization: new Headers(init?.headers).get("Authorization"),
    })

    if (reply === "down") throw new TypeError("connection refused")
    if (typeof reply === "number") return Response.json({ message: "refused" }, { status: reply })

    // claims the cloud would sign for this user, a forged token claims everything
    const status =
      typeof reply === "function"
        ? reply(body.cloudUserId)
        : typeof reply === "object"
          ? reply
          : { contingency: false, relay: true }
    const claims = { sub: body.cloudUserId, bridgeId: body.bridgeId, typ: tokenTypes.status, ...status }
    const token = reply === "untrusted" ? await signUntrustedAssertion(claims) : await signAssertion(claims)

    return Response.json({ token: await seal(token, body.epk) })
  }) as typeof fetch

  return calls
}

/** restores the real fetch */
export const restoreCloud = () => {
  globalThis.fetch = realFetch
}

/**
 * turns the status channel on, and the relay gate with it unless told otherwise
 *
 * caching is off by default so every check reaches the fake cloud
 *
 * @param options whether to gate on the relay plan, and the cache lifetime
 */
export const enableChannel = ({ gated = true, ttlMs = 0 }: { gated?: boolean; ttlMs?: number } = {}) => {
  process.env.CLOUD_STATUS_URL = statusUrl
  process.env.BRIDGE_RELAY_SECRET = relaySecret
  process.env.CONTINGENCY_TTL_MS = String(ttlMs)
  if (gated) process.env.REQUIRE_RELAY_ENTITLEMENT = "true"
  else delete process.env.REQUIRE_RELAY_ENTITLEMENT
}

/** turns the status channel and the relay gate back off */
export const disableChannel = () => {
  delete process.env.CLOUD_STATUS_URL
  delete process.env.BRIDGE_RELAY_SECRET
  delete process.env.CONTINGENCY_TTL_MS
  delete process.env.REQUIRE_RELAY_ENTITLEMENT
}
