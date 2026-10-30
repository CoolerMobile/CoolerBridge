import { sql } from "drizzle-orm"
import { db } from "@/db"
import { bridges, cloudLinks, devices, events, pairingChallenges, sessions } from "@/db/schema"
import { generateSessionToken, tokenDigest } from "@/auth/utils"
import type { OperatingSystem } from "@/schemas/cooler"

/**
 * adopts a drizzle query (a custom thenable) into a native promise
 *
 * lets `expect(...).rejects` await queries that are not real promises
 *
 * @param query a drizzle query builder
 */
export const run = <T>(query: PromiseLike<T>): Promise<T> => Promise.resolve(query)

/**
 * wipes every table and resets identities
 *
 * called before each db-backed test to keep them isolated
 */
export const resetDb = async () => {
  await db.execute(
    sql`truncate table ${bridges}, ${cloudLinks}, ${events}, ${pairingChallenges}, ${sessions}, ${devices} restart identity cascade`
  )
}

/**
 * inserts a bridge
 *
 * @param secret bridge secret, random-ish by default
 * @param enabled whether the bridge is active
 */
export const seedBridge = async (secret = `secret_${crypto.randomUUID()}`, enabled = true) => {
  const [bridge] = await db.insert(bridges).values({ secret, enabled }).returning()
  return bridge!
}

/**
 * inserts a cloud link
 *
 * the bridge id is stored as the real bridge uuid so that routes
 * keying events/devices off it resolve against seeded data
 *
 * @param bridgeId value stored in the bridge_id column
 * @param revoked whether the link is revoked
 */
export const seedCloudLink = async (bridgeId: string, revoked = false) => {
  const [link] = await db
    .insert(cloudLinks)
    .values({
      cloudUserId: "usr_test",
      bridgeId,
      revokedAt: revoked ? new Date() : null,
    })
    .returning()
  return link!
}

/**
 * inserts a session row directly
 *
 * @param opts session overrides
 */
export const seedSession = async (opts: {
  cloudLinkId: string
  bridgeId: string
  tokenDigest: string
  scopes?: string[]
  expiresAt?: Date
  revokedAt?: Date | null
}) => {
  const [session] = await db
    .insert(sessions)
    .values({
      cloudLinkId: opts.cloudLinkId,
      bridgeId: opts.bridgeId,
      tokenDigest: opts.tokenDigest,
      scopes: (opts.scopes ?? []) as never,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: opts.revokedAt ?? null,
    })
    .returning()
  return session!
}

/**
 * inserts an event for a bridge
 *
 * @param bridgeId owning bridge uuid
 * @param overrides partial event fields
 */
export const seedEvent = async (
  bridgeId: string,
  overrides: Partial<{
    type: string
    severity: "info" | "success" | "warning" | "error"
    title: string
    message: string
  }> = {}
) => {
  const [event] = await db
    .insert(events)
    .values({
      bridgeId,
      type: overrides.type ?? "deployment_success",
      severity: overrides.severity ?? "success",
      title: overrides.title ?? "Deployment successful",
      message: overrides.message ?? "all good",
    })
    .returning()
  return event!
}

/**
 * builds a fully authenticated fixture
 *
 * seeds a bridge, a cloud link whose bridge_id is the bridge uuid
 * (so event/device lookups resolve), and a live session. the
 * returned bearer token passes requireAuth
 *
 * @param scopes scopes granted to the session
 */
export const seedAuthedSession = async (scopes: string[] = []) => {
  const bridge = await seedBridge()
  const cloudLink = await seedCloudLink(bridge.id)

  const token = generateSessionToken()
  const session = await seedSession({
    cloudLinkId: cloudLink.id,
    bridgeId: bridge.id,
    tokenDigest: tokenDigest(token),
    scopes,
  })

  return { bridge, cloudLink, session, token, authHeader: { Authorization: `Bearer ${token}` } }
}

/**
 * inserts a device for a cloud link
 *
 * @param cloudLinkId owning cloud link id
 * @param overrides partial device fields
 */
export const seedDevice = async (
  cloudLinkId: string,
  overrides: Partial<{
    platform: OperatingSystem
    pushToken: string
    revokedAt: Date | null
  }> = {}
) => {
  const [device] = await db
    .insert(devices)
    .values({
      cloudLinkId,
      platform: overrides.platform ?? "ios",
      pushToken: overrides.pushToken ?? `ExponentPushToken[${crypto.randomUUID()}]`,
      revokedAt: overrides.revokedAt ?? null,
    })
    .returning()
  return device!
}
