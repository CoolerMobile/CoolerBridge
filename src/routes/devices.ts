import { requireAuth, requireScopes } from "@/auth/middleware"
import { db } from "@/db"
import { cloudLinks, devices } from "@/db/schema"
import { zValidator } from "@hono/zod-validator"
import { and, desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import z from "zod"

export const deviceRoutes = new Hono()

// device schema
const deviceSchema = z.object({
  deviceData: z.object({
    platform: z.enum(["ios", "android"]),
    pushProvider: z.enum(["apns", "fcm"]),
    pushToken: z.string().min(1),
  }),
})

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
  return context.json(deviceList)
})

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

    // create device for current user's cloud link
    const [device] = await db
      .insert(devices)
      .values({
        ...deviceData,
        cloudLinkId: cloudLink.id,
      })
      .returning()

    // return created device
    return context.json(device, 201)
  }
)

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
