import { db } from "@/db"
import { cloudLinks, devices } from "@/db/schema"
import { Event } from "@/schemas/cooler"
import { and, eq, inArray, isNull } from "drizzle-orm"

/**
 * get current user's active devices
 *
 * @param event cooler event
 *
 * @returns active device list
 */
export const activeDevices = async (event: Event) => {
  return await db
    .select({
      id: devices.id,
      cloudLinkId: devices.cloudLinkId,
      platform: devices.platform,
      pushToken: devices.pushToken,
      createdAt: devices.createdAt,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .innerJoin(cloudLinks, eq(devices.cloudLinkId, cloudLinks.id))
    .where(
      and(eq(cloudLinks.bridgeId, event.bridgeId), isNull(cloudLinks.revokedAt), isNull(devices.revokedAt))
    )
}

/**
 * revoke devices by id
 *
 * used to prune tokens expo no longer recognizes
 *
 * @param deviceIds device ids to revoke
 */
export const revokeDevices = async (deviceIds: string[]) => {
  if (deviceIds.length === 0) return

  await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(and(inArray(devices.id, deviceIds), isNull(devices.revokedAt)))
}
