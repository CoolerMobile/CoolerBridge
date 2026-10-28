import { AuthVariables } from "@/schemas/bridge"
import { createMiddleware } from "hono/factory"
import { sessionTokenDigest } from "@/auth/utils"
import { db } from "@/db"
import { and, eq, gt, isNull } from "drizzle-orm"
import { sessions } from "@/db/schema"

/**
 * auth-gate for protected routes
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
  const tokenDigest = sessionTokenDigest(token)

  // session
  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.tokenDigest, tokenDigest),
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

  // set session for current context
  context.set("session", session)

  // proceed
  await next()
})

/**
 * scope-gate for scope-specific routes
 */
export const requireScope = (scope: string) => {
  return createMiddleware<{
    Variables: AuthVariables
  }>(async (context, next) => {
    // current session
    const session = context.get("session")

    // validate included scopes
    if (!session.scopes.includes(scope)) {
      return context.json(
        {
          error: "Forbidden",
        },
        403
      )
    }

    // proceed
    await next()
  })
}
