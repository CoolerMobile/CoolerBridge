import { requireAuth, requireScopes } from "@/auth/middleware"
import { generateSessionToken, tokenDigest } from "@/auth/utils"
import { db } from "@/db"
import { cloudLinks, devices } from "@/db/schema"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq } from "drizzle-orm"
import { Expo } from "expo-server-sdk"
import { Hono } from "hono"
import z from "zod"

export const deviceRoutes = new Hono()

// #region Device Schema
/**
 * @docs Request body for registering a device, validating its platform and a
 * genuine Expo push token.
 */
// device schema
const deviceSchema = z.object({
  deviceData: z.object({
    platform: z.enum(["ios", "android"]),
    pushToken: z.string().refine(Expo.isExpoPushToken, "invalid expo push token"),
  }),
})
// #endregion

// #region Public Device
/**
 * strips fields a device row must never expose
 *
 * @param device device row
 *
 * @returns device without its event token digest
 *
 * @docs Removes the event token digest from a device before it is returned.
 */
const publicDevice = ({ eventTokenDigest: _, ...device }: typeof devices.$inferSelect) => device
// #endregion

// #region List Devices Route
/**
 * @docs Returns the authenticated account's devices, newest first, for callers
 * holding the devices:read scope.
 */
// get user's devices
deviceRoutes.get("/", requireAuth, requireScopes(["devices:read"]), async (context) => {
  // cloud link
  const cloudLink = context.get("cloudLink")

  // validate cloud link
  if (!cloudLink || cloudLink.revokedAt) {
    return context.json(
      {
        error: "Unauthorized",
      },
      401
    )
  }

  // cloud-link based devices
  const deviceList = await db
    .select()
    .from(devices)
    .where(eq(devices.cloudLinkId, cloudLink.id))
    .orderBy(desc(devices.createdAt))

  // return json-encoded device list
  return context.json(deviceList.map(publicDevice))
})
// #endregion

// #region Create Device Route
/**
 * @docs Registers a device under the authenticated account's cloud link,
 * requiring the devices:write scope. A push token identifies one app install,
 * so registering a token the bridge already knows moves that device to the
 * registering link, as when a phone pairs again, instead of failing. Every
 * registration issues a fresh event token, returned once as `eventToken`, that
 * the device uses to read the events it is pushed.
 */
// create device
deviceRoutes.post(
  "/",
  zValidator("json", deviceSchema),
  requireAuth,
  requireScopes(["devices:read", "devices:write"]),
  async (context) => {
    // cloud link & device data
    const cloudLink = context.get("cloudLink")
    const { deviceData } = context.req.valid("json")

    // validate cloud link
    if (!cloudLink || cloudLink.revokedAt) {
      return context.json(
        {
          error: "Unauthorized",
        },
        401
      )
    }

    // event token, rotated on every registration
    const eventToken = generateSessionToken()
    const eventTokenDigest = tokenDigest(eventToken)

    // create device for current user's cloud link
    // a known push token is the same install, so it moves here and is restored
    const [device] = await db
      .insert(devices)
      .values({
        ...deviceData,
        cloudLinkId: cloudLink.id,
        eventTokenDigest,
      })
      .onConflictDoUpdate({
        target: devices.pushToken,
        set: { platform: deviceData.platform, cloudLinkId: cloudLink.id, eventTokenDigest, revokedAt: null },
      })
      .returning()

    // return created device, the event token is only ever shown here
    return context.json({ ...publicDevice(device!), eventToken }, 201)
  }
)
// #endregion

// #region Delete Device Route
/**
 * @docs Removes a device owned by the authenticated account by id, requiring
 * the devices:write scope.
 */
// delete device by id
deviceRoutes.delete(
  "/:id",
  requireAuth,
  requireScopes(["devices:read", "devices:write"]),
  async (context) => {
    // cloud link & device id
    const cloudLink = context.get("cloudLink")
    const deviceId = context.req.param("id")

    // validate cloud link
    if (!cloudLink || cloudLink.revokedAt) {
      return context.json(
        {
          error: "Unauthorized",
        },
        401
      )
    }

    // delete device
    const [deleted] = await db
      .delete(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.cloudLinkId, cloudLink.id)))
      .returning({
        id: devices.id,
      })

    // validate deletion
    //
    // no row removed means the id is unknown
    // or the device belongs to another link
    if (!deleted) {
      return context.json({ error: "Device not found" }, 404)
    }

    // return success
    return context.json({
      deviceId: deviceId,
      deleted: true,
    })
  }
)
// #endregion
