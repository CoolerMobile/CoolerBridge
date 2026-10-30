import { Device, Event, PushDelivery, PushProvider } from "@/schemas/cooler"
import { revokeDevices } from "@/services/devices"
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk"

/**
 * expo client
 *
 * EXPO_ACCESS_TOKEN is optional but recommended, it enables push security
 * so only authorized callers can send to your project's tokens
 *
 * @see https://docs.expo.dev/push-notifications/sending-notifications/#additional-security
 */
const expo = new Expo({
  accessToken: Bun.env.EXPO_ACCESS_TOKEN,
})

/**
 * builds an expo push message for a device
 *
 * @param device device to deliver to
 * @param event cooler event to deliver
 *
 * @returns {ExpoPushMessage} expo push message
 */
const buildMessage = (device: Device, event: Event): ExpoPushMessage => ({
  to: device.pushToken,
  title: event.title,
  body: event.message,
  sound: "default",
  priority: "high",
  data: {
    type: "event.available",
    eventId: event.id,
    bridgeId: event.bridgeId,
  },
})

/**
 * expo push provider
 *
 * delivers events to devices via expo's push service, maps each ticket back to
 * its device and prunes tokens expo reports as no longer registered
 *
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
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
