import { Hono } from "hono"
import { db } from "@/db"
import { cloudLinks, pairingChallenges } from "@/db/schema"
import { zValidator } from "@hono/zod-validator"
import { completePairingSchema, pairingStatusParamsSchema } from "@/schemas/bridge"
import { and, eq, gt, isNull, TransactionRollbackError } from "drizzle-orm"
import { verifyPairAssertion } from "@/auth/cloud"
import { codeDigest, generateCode } from "@/auth/utils"

export const pairingRoutes = new Hono()

// #region Create Pairing Challenge Route
/**
 * @docs Issues a short-lived pairing code and challenge for a device to begin
 * linking.
 */
// create pairing challenge
pairingRoutes.post("/", async (context) => {
  // pairing code
  const code = generateCode()

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
// #endregion

// #region Pairing Status Route
/**
 * @docs Reports a pairing challenge's state, pending, completed, or expired.
 * Once completed it also returns the id (`jti`) of the cloud assertion that
 * consumed it, which CoolerCloud matches against the assertion it signed before
 * it considers the bridge paired.
 */
// pairing status
pairingRoutes.get("/:id", zValidator("param", pairingStatusParamsSchema), async (context) => {
  const { id } = context.req.valid("param")

  // pairing challenge
  const pairing = await db.query.pairingChallenges.findFirst({
    where: eq(pairingChallenges.id, id),
  })

  // unknown challenge
  if (!pairing) return context.json({ error: "Pairing not found" }, 404)

  // derive state, consumption wins over expiry
  const status = pairing.usedAt ? "completed" : pairing.expiresAt <= new Date() ? "expired" : "pending"

  return context.json({
    id: pairing.id,
    status,
    jti: status === "completed" ? pairing.assertionJti : null,
  })
})
// #endregion

// #region Complete Pairing Route
/**
 * @docs Completes pairing by matching the code to an unused, unexpired
 * challenge, verifying the cloud assertion, and creating the cloud link. The
 * challenge records the assertion's id, so CoolerCloud can confirm the round
 * trip through the pairing status route.
 * Pairing again from the same account (such as re-scanning the pairing QR
 * code) keeps the existing link, restoring it if it was revoked, while a
 * bridge already linked to another account is refused.
 */
// complete pairing
pairingRoutes.post("/complete", zValidator("json", completePairingSchema), async (context) => {
  // extract code & assertion from request
  // validate as json
  const { code, assertion } = context.req.valid("json")

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
    cloud = await verifyPairAssertion(assertion)
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
  //
  // a single upsert claims the bridge, so concurrent completions can never race
  // into a duplicate; a re-pair from the same account keeps (and restores) its
  // link, while a bridge linked to another account matches no row
  const outcome = await db
    .transaction(async (tx) => {
      const [link] = await tx
        .insert(cloudLinks)
        .values({
          cloudUserId: cloud.cloudUserId,
          bridgeId: cloud.cloudBridgeId,
        })
        .onConflictDoUpdate({
          target: cloudLinks.bridgeId,
          set: { revokedAt: null },
          setWhere: eq(cloudLinks.cloudUserId, cloud.cloudUserId),
        })
        .returning()

      // a bridge belongs to a single account
      if (!link) return { error: "Bridge is already linked to another account" } as const

      // update code usage, recording the consuming assertion for cloud confirmation
      const [consumed] = await tx
        .update(pairingChallenges)
        .set({
          usedAt: new Date(),
          assertionJti: cloud.jti,
        })
        .where(
          and(
            eq(pairingChallenges.id, pairing.id),
            isNull(pairingChallenges.usedAt),
            gt(pairingChallenges.expiresAt, new Date())
          )
        )
        .returning({ id: pairingChallenges.id })

      // consumed concurrently, undo the link change with the rest of the transaction
      if (!consumed) tx.rollback()

      return { link } as const
    })
    .catch((error) => {
      if (error instanceof TransactionRollbackError)
        return { error: "Pairing code was already used" } as const
      throw error
    })

  // refused, nothing was written
  if ("error" in outcome) return context.json({ error: outcome.error }, 409)
  const { link } = outcome

  // return link status
  return context.json(
    {
      linked: true,
      cloudBridgeId: link.bridgeId,
    },
    200
  )
})
// #endregion
