import { AuthVariables, DeviceAuthVariables } from "@/schemas/bridge"
import { createMiddleware } from "hono/factory"
import { tokenDigest } from "@/auth/utils"
import { db } from "@/db"
import { and, eq, gt, isNull } from "drizzle-orm"
import { cloudLinks, devices, sessions } from "@/db/schema"
import { BridgeScope, hasScope } from "@/services/scopes"
import { isContingencyActive, isRelayGated } from "@/services/contingency"
import { timingSafeEqual } from "node:crypto"

// #region Require Auth
/**
 * auth-gate for protected routes
 *
 * @docs Middleware that authenticates a bearer token, resolves its live session
 * and cloud link, and exposes them to the handler.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
  // authorization header
  const authHeader = context.req.header("Authorization")

  // validate authorization type
  // must match "Bearer *"
  if (!authHeader?.startsWith("Bearer ")) {
    return context.json(
      {
        error: "Unauthorized",
      },
      401
    )
  }

  // token & digest
  const token = authHeader.slice("Bearer ".length)
  const digest = tokenDigest(token)

  // session
  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.tokenDigest, digest),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date())
    ),
  })

  // validate session
  if (!session) {
    return context.json(
      {
        error: "Unauthorized",
      },
      401
    )
  }

  // cloud link
  const cloudLink = await db.query.cloudLinks.findFirst({
    where: eq(cloudLinks.id, session.cloudLinkId),
  })

  // validate cloud link
  // checks if a link exists and if it hasn't been revoked
  if (!cloudLink || cloudLink.revokedAt) {
    return context.json(
      {
        error: "Unauthorized",
      },
      401
    )
  }

  // contingency gate - a raised moat makes every bridge non-operational
  if (await isContingencyActive({ cloudUserId: cloudLink.cloudUserId, bridgeId: cloudLink.bridgeId })) {
    return context.json(
      {
        error: "Account in contingency mode",
      },
      423
    )
  }

  // set session & cloud link for current context
  context.set("session", session)
  context.set("cloudLink", cloudLink)

  // proceed
  await next()
})
// #endregion

// #region Require Device
/**
 * auth-gate for routes a device calls while presenting a push
 *
 * the event token outlives sessions so a push arriving hours after the app
 * last ran can still be presented, it dies with its device
 *
 * @docs Middleware that authenticates a device event token, resolves its active
 * device and cloud link, and exposes them to the handler. Event tokens are
 * issued when a device registers and stop working once the device or its link
 * is revoked.
 */
export const requireDevice = createMiddleware<{ Variables: DeviceAuthVariables }>(async (context, next) => {
  // authorization header
  const authHeader = context.req.header("Authorization")

  // validate authorization type
  // must match "Bearer *"
  if (!authHeader?.startsWith("Bearer ")) {
    return context.json(
      {
        error: "Unauthorized",
      },
      401
    )
  }

  // token & digest
  const token = authHeader.slice("Bearer ".length)
  const digest = tokenDigest(token)

  // device
  const device = await db.query.devices.findFirst({
    where: and(eq(devices.eventTokenDigest, digest), isNull(devices.revokedAt)),
  })

  // validate device
  if (!device) {
    return context.json(
      {
        error: "Unauthorized",
      },
      401
    )
  }

  // cloud link
  const cloudLink = await db.query.cloudLinks.findFirst({
    where: eq(cloudLinks.id, device.cloudLinkId),
  })

  // validate cloud link
  // checks if a link exists and if it hasn't been revoked
  if (!cloudLink || cloudLink.revokedAt) {
    return context.json(
      {
        error: "Unauthorized",
      },
      401
    )
  }

  // contingency gate - a raised moat makes every bridge non-operational
  if (await isContingencyActive({ cloudUserId: cloudLink.cloudUserId, bridgeId: cloudLink.bridgeId })) {
    return context.json(
      {
        error: "Account in contingency mode",
      },
      423
    )
  }

  // set device & cloud link for current context
  context.set("device", device)
  context.set("cloudLink", cloudLink)

  // proceed
  await next()
})
// #endregion

// #region Require Relay Caller
/**
 * auth-gate for bridge provisioning on the hosted relay
 *
 * the relay secret is already shared with the cloud for status checks, so it
 * doubles as proof that a provisioning request comes from the cloud, which only
 * asks for relay plan holders
 *
 * @docs Middleware that, on the hosted relay, only lets CoolerCloud create
 * bridges: the request must present the shared relay secret as a bearer,
 * compared in constant time, and is refused when no secret is configured.
 * Self-hosted bridges skip the check entirely.
 */
export const requireRelayCaller = createMiddleware(async (context, next) => {
  // self-hosted bridges provision freely
  if (!isRelayGated()) return next()

  // presented and expected secrets, refused outright when unset
  const secret = Bun.env.BRIDGE_RELAY_SECRET
  const authHeader = context.req.header("Authorization")
  const presented = Buffer.from(authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "")
  const expected = Buffer.from(secret ?? "")

  // constant-time comparison, lengths must match first
  if (!secret || presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return context.json(
      {
        error: "Unauthorized",
      },
      401
    )
  }

  // proceed
  await next()
})
// #endregion

// #region Require Scopes
/**
 * scope-gate for scope-specific routes
 *
 * @docs Middleware factory that gates a route on one or more required scopes.
 */
export const requireScopes = (scopes: BridgeScope[]) => {
  return createMiddleware<{
    Variables: AuthVariables
  }>(async (context, next) => {
    // current session
    const session = context.get("session")

    // validate included scopes
    // bail out on the first missing scope
    for (const scope of scopes) {
      if (!hasScope(scope, session.scopes as BridgeScope[])) {
        return context.json(
          {
            error: "Forbidden",
          },
          403
        )
      }
    }

    // proceed
    await next()
  })
}
// #endregion
