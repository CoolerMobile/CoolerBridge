import z from "zod"
import { cloudLinks, sessions } from "@/db/schema"

// #region Complete Pairing Schema
/**
 * @docs Request body for completing a pairing, carrying the human-readable
 * code and the signed cloud assertion.
 */
export const completePairingSchema = z.object({
  code: z.string(),
  assertion: z.string(),
})
// #endregion

// #region Pairing Status Params Schema
/**
 * @docs Route params for reading a pairing challenge's status, the challenge
 * id issued when it was created.
 */
export const pairingStatusParamsSchema = z.object({
  id: z.uuid(),
})
// #endregion

// #region Auth Variables
/**
 * @docs Hono context variables set by the auth middleware, exposing the active
 * session and its cloud link to downstream handlers.
 */
export type AuthVariables = {
  session: typeof sessions.$inferSelect
  cloudLink: typeof cloudLinks.$inferSelect
}
// #endregion
