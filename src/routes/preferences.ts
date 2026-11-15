import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { db } from "@/db"
import { devices } from "@/db/schema"
import { requireDevice } from "@/auth/middleware"
import { devicePreferencesSchema } from "@/schemas/bridge"

export const preferenceRoutes = new Hono()

// #region Update Preferences Route
/**
 * @docs Replaces the notification preferences of the calling device,
 * authenticated by its event token. Cooler sends them whenever quiet hours or
 * alert categories change and each time it syncs, so the bridge can hold back
 * pushes the device would otherwise have to hide.
 */
// replace the calling device's preferences
preferenceRoutes.put("/", requireDevice, zValidator("json", devicePreferencesSchema), async (context) => {
  // device & preferences
  const device = context.get("device")
  const preferences = context.req.valid("json")

  // store preferences
  await db.update(devices).set({ preferences }).where(eq(devices.id, device.id))

  // return stored preferences
  return context.json(preferences)
})
// #endregion
