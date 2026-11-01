import { AuthVariables } from "@/schemas/bridge"
import { createMiddleware } from "hono/factory"
import { tokenDigest } from "@/auth/utils"
import { db } from "@/db"
import { and, eq, gt, isNull } from "drizzle-orm"
import { cloudLinks, sessions } from "@/db/schema"
import { BridgeScope, hasScope } from "@/services/scopes"

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

  // set session & cloud link for current context
  context.set("session", session)
  context.set("cloudLink", cloudLink)

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
