import { Hono } from "hono"
import { db } from "@/db"
import { cloudLinks, pairingChallenges } from "@/db/schema"
import { zValidator } from "@hono/zod-validator"
import { completePairingSchema } from "@/schemas/bridge"
import { and, eq, gt, isNull } from "drizzle-orm"
import { verifyAssertion } from "@/auth/cloud"
import { codeDigest, generateCode } from "@/auth/utils"

export const pairingRoutes = new Hono()

// create pairing challenge
pairingRoutes.post("/", async (context) => {
  // code & hash
  const code = generateCode()
  const codeHash = await Bun.password.hash(code)

  // expiry - 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  // create pairing challenge
  const [pairing] = await db
    .insert(pairingChallenges)
    .values({ codeDigest: codeDigest(code), expiresAt })
    .returning({
      id: pairingChallenges.id,
      expiresAt: pairingChallenges.expiresAt,
    })

  // validate challenge was created
  if (!pairing) return context.json({ error: "Failed to create pairing challenge" }, 500)

  // return challenge
  return context.json(
    {
      id: pairing.id,
      code,
      expiresAt: pairing.expiresAt,
    },
    201
  )
})

// complete pairing
pairingRoutes.post("/complete", zValidator("json", completePairingSchema), async (context) => {
  // extract code & assertion from request
  // validate as json
  const { code, assertion } = context.req.valid("json")

  // pairing candidates
  // validate null usage & non-expired
  const candidates = await db
    .select()
    .from(pairingChallenges)
    .where(and(isNull(pairingChallenges.usedAt), gt(pairingChallenges.expiresAt, new Date())))

  // find matching pairing code by digest
  //
  // pairing is only valid if the code hasn't been used
  // and it hasn't expired or been consumed yet
  const digest = codeDigest(code)
  const pairing = await db.query.pairingChallenges.findFirst({
    where: and(
      eq(pairingChallenges.codeDigest, digest),
      isNull(pairingChallenges.usedAt),
      gt(pairingChallenges.expiresAt, new Date())
    ),
  })

  // no matches - invalid or expired code
  if (!pairing) {
    return context.json(
      {
        error: "Invalid or expired pairing code",
      },
      400
    )
  }

  // validate cloud assertion
  let cloud
  try {
    cloud = await verifyAssertion(assertion)
  } catch (error) {
    console.error("invalid cloud assertion:", error)
    return context.json({ error: "Invalid cloud assertion" }, 401)
  }

  // validate id
  if (cloud.pairingId !== pairing.id) {
    return context.json(
      {
        error: "Pairing assertion does not match challenge",
      },
      401
    )
  }

  // create link & update code usage
  const link = await db.transaction(async (tx) => {
    // set up link
    const [created] = await tx
      .insert(cloudLinks)
      .values({
        cloudUserId: cloud.cloudUserId,
        cloudBridgeId: cloud.cloudBridgeId,
      })
      .returning()

    // update code usage
    const [consumed] = await tx
      .update(pairingChallenges)
      .set({
        usedAt: new Date(),
      })
      .where(
        and(
          eq(pairingChallenges.id, pairing.id),
          isNull(pairingChallenges.usedAt),
          gt(pairingChallenges.expiresAt, new Date())
        )
      )
      .returning({ id: pairingChallenges.id })

    // validate consumed state
    if (!consumed) throw Error("Pairing challenge already consumed")

    // return created link
    return created
  })

  // return link status
  return context.json(
    {
      linked: true,
      cloudBridgeId: link.cloudBridgeId,
    },
    200
  )
})
