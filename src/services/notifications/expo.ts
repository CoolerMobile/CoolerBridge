import { Device, Event, PushDelivery, PushProvider } from "@/schemas/cooler"
import { revokeDevices } from "@/services/devices"
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk"

// #region Expo Client
/**
 * expo client
 *
 * the bridge only forwards events, the push project and its credentials live in
 * Cooler so self-hosters never configure a provider here
 *
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * @docs The Expo client used to forward events; push credentials live in
 * Cooler, so self-hosters configure no provider here.
 */
const expo = new Expo()
// #endregion

// #region Placeholder Alert
/**
 * generic alert an ios push carries until the app replaces it
 *
 * @docs The generic alert an iOS push carries. Cooler's notification service
 * extension replaces it with the fetched event before it is shown, and it only
 * stays when the event cannot be fetched.
 */
export const PLACEHOLDER_ALERT = {
  title: "New Coolify event",
  body: "Open Cooler to see the details.",
}
// #endregion

// #region Build Message
/**
 * builds an expo push message for a device
 *
 * the message never carries event content, only ids, the app fetches the event
 * from the bridge and presents it
 *
 * ios gets a generic mutable alert so the notification service extension runs
 * on every push and swaps in the fetched event, android gets a high priority
 * data-only message the app presents itself
 *
 * @param device device to deliver to
 * @param event cooler event to deliver
 *
 * @returns {ExpoPushMessage} expo push message
 *
 * @docs Builds an Expo push message for a device. It carries only the event and
 * bridge ids, never the event content, so Expo, APNs and FCM never see what
 * happened. On iOS it is a generic alert that Cooler's notification service
 * extension rewrites with the fetched event before it is shown, and on Android
 * a high priority data-only message that Cooler presents itself.
 */
export const buildMessage = (device: Device, event: Event): ExpoPushMessage => {
  const message: ExpoPushMessage = {
    to: device.pushToken,
    priority: "high",
    data: {
      type: "event.available",
      eventId: event.id,
      bridgeId: event.bridgeId,
    },
  }

  // android presents the fetched event itself
  if (device.platform !== "ios") return message

  return {
    ...message,
    ...PLACEHOLDER_ALERT,
    sound: "default",
    // runs the notification service extension
    mutableContent: true,
  }
}
// #endregion

// #region Expo Push Provider
/**
 * expo push provider
 *
 * delivers events to devices via expo's push service, maps each ticket back to
 * its device and prunes tokens expo reports as no longer registered
 *
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * @docs Delivers events to devices through Expo, mapping each ticket back to
 * its device and pruning tokens Expo reports as unregistered.
 */
export const expoPushProvider: PushProvider = {
  async send(devices, event) {
    // only devices carrying a valid expo push token
    const targets = devices.filter((device) => Expo.isExpoPushToken(device.pushToken))

    // nothing to deliver
    if (targets.length === 0) return []

    // messages aligned to targets by index
    const messages = targets.map((device) => buildMessage(device, event))

    // expo caps the number of messages per request
    const chunks = expo.chunkPushNotifications(messages)

    // tickets aligned to targets by index
    const tickets: ExpoPushTicket[] = []
    for (const chunk of chunks) {
      try {
        const chunkTickets = await expo.sendPushNotificationsAsync(chunk)
        tickets.push(...chunkTickets)
      } catch (error) {
        // the whole chunk failed, mark each of its messages as errored
        for (let i = 0; i < chunk.length; i++) {
          tickets.push({
            status: "error",
            message: error instanceof Error ? error.message : "expo request failed",
          })
        }
      }
    }

    // map each ticket back to its device
    const deliveries: PushDelivery[] = targets.map((device, index) => {
      const ticket = tickets[index]

      // successful ticket carries a receipt id
      if (ticket?.status === "ok") {
        return {
          deviceId: device.id,
          status: "ok",
          ticketId: ticket.id,
        }
      }

      // errored or missing ticket
      return {
        deviceId: device.id,
        status: "error",
        error: ticket?.message ?? "no ticket returned",
      }
    })

    // devices whose token expo no longer recognizes
    const staleIds = targets
      .filter((_, index) => {
        const ticket = tickets[index]
        return ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered"
      })
      .map((device) => device.id)

    // prune stale devices so they stop receiving pushes
    if (staleIds.length > 0) {
      await revokeDevices(staleIds)
    }

    return deliveries
  },
}
// #endregion
