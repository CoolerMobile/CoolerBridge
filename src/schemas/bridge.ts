import z from "zod"
import { cloudLinks, devices, sessions } from "@/db/schema"

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

// #region Revoke Pairing Schema
/**
 * @docs Request body for revoking a pairing, carrying the cloud-signed revoke
 * assertion.
 */
export const revokePairingSchema = z.object({
  assertion: z.string().min(1),
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

// #region Device Preferences Schema
/**
 * minutes since local midnight
 */
const minuteOfDay = z.number().int().min(0).max(1439)

/**
 * @docs Notification preferences a device keeps on the bridge: its IANA time
 * zone, optional quiet hours as minutes since local midnight (overnight ranges
 * such as 22:00 to 07:00 are allowed), and which alert categories it wants.
 * The bridge sends nothing to a device during its quiet hours or for a muted
 * category.
 */
export const devicePreferencesSchema = z.object({
  timeZone: z.string().refine((timeZone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone })
      return true
    } catch {
      return false
    }
  }, "invalid time zone"),
  quietHours: z.object({ from: minuteOfDay, to: minuteOfDay }).nullable(),
  categories: z.object({
    deployments: z.boolean(),
    backups: z.boolean(),
    scheduledTasks: z.boolean(),
    servers: z.boolean(),
  }),
})
// #endregion

// #region Device Preferences Type
/**
 * @docs The validated notification preferences of a device.
 */
export type DevicePreferences = z.infer<typeof devicePreferencesSchema>
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

// #region Device Auth Variables
/**
 * @docs Hono context variables set by the device auth middleware, exposing the
 * authenticated device and its cloud link to downstream handlers.
 */
export type DeviceAuthVariables = {
  device: typeof devices.$inferSelect
  cloudLink: typeof cloudLinks.$inferSelect
}
// #endregion
