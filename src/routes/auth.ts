import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import z from "zod"
import { verifyCloudAssertion } from "@/auth/cloud"
import { db } from "@/db"
import { and, eq, isNull } from "drizzle-orm"
import { cloudLinks, sessions } from "@/db/schema"
import { generateSessionToken, sessionTokenDigest } from "@/auth/utils"

export const authRoutes = new Hono()

// exchange schema
const exchangeSchema = z.object({
  assertion: z.string().min(1),
})

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
      eq(cloudLinks.cloudBridgeId, cloud.cloudBridgeId),
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
  const tokenDigest = sessionTokenDigest(token)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

  // create session
  const [session] = await db
    .insert(sessions)
    .values({
      cloudLinkId: link.id,
      tokenDigest,
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
    scopes: cloud.scope,
  })
})
