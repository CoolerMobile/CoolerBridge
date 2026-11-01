import { Event } from "@/schemas/cooler"
import { activeDevices } from "@/services/devices"
import { expoPushProvider } from "@/services/notifications/expo"

// #region Dispatch Event
/**
 * dispatches an event to active devices
 *
 * @param event event to dispatch
 *
 * @docs Dispatches an event to the active linked devices and logs any failed
 * deliveries.
 */
export const dispatchEvent = async (event: Event) => {
  // get active linked devices
  const devices = await activeDevices(event)

  // validate user has active devices
  if (!devices || devices.length === 0) return

  // deliver via expo
  const deliveries = await expoPushProvider.send(devices, event)

  // log failed deliveries
  for (const delivery of deliveries) {
    if (delivery.status === "error") {
      console.error(`Failed to notify device ${delivery.deviceId}:`, delivery.error)
    }
  }
}
// #endregion
