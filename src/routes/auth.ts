import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import z from "zod"
import { verifyCloudAssertion } from "@/auth/cloud"
import { db } from "@/db"
import { and, eq, isNull } from "drizzle-orm"
import { cloudLinks, sessions } from "@/db/schema"
import { generateSessionToken, tokenDigest } from "@/auth/utils"
import { requireAuth } from "@/auth/middleware"
import { isBridgeScope } from "@/services/scopes"

export const authRoutes = new Hono()

// #region Exchange Schema
/**
 * @docs Request body for the token exchange, carrying the signed cloud access
 * assertion.
 */
// exchange schema
const exchangeSchema = z.object({
  assertion: z.string().min(1),
})
// #endregion

// #region Current Session Route
/**
 * @docs Returns the authenticated session's id, granted scopes, and expiry.
 */
authRoutes.get("/me", requireAuth, async (context) => {
  // current session
  const session = context.get("session")

  // validate session
  if (!session) {
    return context.json(
      {
        error: "Not signed in",
      },
      401
    )
  }

  // return session data
  return context.json({
    sessionId: session.id,
    scopes: session.scopes,
    expiresAt: session.expiresAt,
  })
})
// #endregion

// #region Logout Route
/**
 * @docs Revokes the current session, rejecting the request if it has already
 * been revoked.
 */
authRoutes.post("/logout", requireAuth, async (context) => {
  const session = context.get("session")

  try {
    // set revokedAt to current time
    // effectively revoking current session
    const [revoked] = await db
      .update(sessions)
      .set({
        revokedAt: new Date(),
      })
      .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
      .returning({
        id: sessions.id,
        revokedAt: sessions.revokedAt,
      })

    // validate revoke operation
    if (!revoked) {
      return context.json(
        {
          error: "Session already revoked",
        },
        401
      )
    }

    // return success
    return context.json({
      loggedOut: true,
    })
  } catch (error) {
    console.error("Failed to logout:", error)

    return context.json(
      {
        error: "Failed to logout",
      },
      500
    )
  }
})
// #endregion

// #region Token Exchange Route
/**
 * @docs Exchanges a verified cloud access assertion for a scoped, time-limited
 * bridge session token.
 */
authRoutes.post("/exchange", zValidator("json", exchangeSchema), async (context) => {
  // extract assertion from request
  const { assertion } = context.req.valid("json")

  // validate cloud access assertion
  let cloud
  try {
    cloud = await verifyCloudAssertion(assertion)
  } catch (error) {
    console.error("Access assertion validation failed:", error)

    return context.json(
      {
        error: "Invalid cloud assertion",
      },
      401
    )
  }

  // validate bridge link
  const link = await db.query.cloudLinks.findFirst({
    where: and(
      eq(cloudLinks.cloudUserId, cloud.cloudUserId),
      eq(cloudLinks.bridgeId, cloud.cloudBridgeId),
      isNull(cloudLinks.revokedAt)
    ),
  })

  // invalid link
  if (!link) {
    return context.json(
      {
        error: "Bridge is not linked to this account",
      },
      403
    )
  }

  // generate session data
  // expires in 1 hour
  const token = generateSessionToken()
  const digest = tokenDigest(token)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  const scopes = cloud.scope.filter(isBridgeScope)

  // create session
  const [session] = await db
    .insert(sessions)
    .values({
      cloudLinkId: link.id,
      tokenDigest: digest,
      scopes,
      bridgeId: link.bridgeId,
      expiresAt,
    })
    .returning({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
    })

  // failed to create session
  if (!session) {
    return context.json(
      {
        error: "Failed to create session",
      },
      500
    )
  }

  // return session data
  return context.json({
    accessToken: token,
    tokenType: "Bearer",
    expiresAt: session.expiresAt,
    scopes,
  })
})
// #endregion
