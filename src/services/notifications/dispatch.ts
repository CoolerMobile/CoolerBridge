import { db } from "@/db"
import { cloudLinks, devices } from "@/db/schema"
import { Event, PushProvider } from "@/schemas/cooler"
import { sendApns } from "@/services/notifications/apns"
import { sendFcm } from "@/services/notifications/fcm"
import { and, eq, isNull } from "drizzle-orm"

/**
 * dispatches an event to active devices
 *
 * @param event event to dispatch
 */
export const dispatchEvent = async (event: Event) => {
  // get active linked devices
  const activeDevices = await db
    .select({
      id: devices.id,
      platform: devices.platform,
      pushProvider: devices.pushProvider,
      pushToken: devices.pushToken,
    })
    .from(devices)
    .innerJoin(cloudLinks, eq(devices.cloudLinkId, cloudLinks.id))
    .where(
      and(eq(cloudLinks.bridgeId, event.bridgeId), isNull(cloudLinks.revokedAt), isNull(devices.revokedAt))
    )

  // validate user has active devices
  if (!activeDevices || activeDevices.length === 0) return

  // payload
  const payload = {
    type: "event.available",
    eventId: event.id,
  }

  // send notification to linked active devices
  const results = await Promise.allSettled(
    activeDevices.map((device) => sendNotification(device.id, device.pushProvider, payload))
  )

  // validate each group & respective entries
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error(`Failed to notify device: ${activeDevices[index].id}:`, result.reason)
    }
  }
}

/**
 * sends a notification (`payload`) to `device` via `provider`
 *
 * @param device device id
 * @param provider apns or fcm
 */
const sendNotification = async (
  deviceId: string,
  provider: PushProvider,
  payload: { type: string; eventId: string }
) => {
  switch (provider) {
    // iOS - APNS
    case "apns":
      return await sendApns(deviceId, payload)

    // Android - FCM
    case "fcm":
      return await sendFcm(deviceId, payload)

    // unsupported
    default:
      throw Error(`Unsupported push provider: ${provider}`)
  }
}
