import { db } from "@/db"
import { events } from "@/db/schema"
import { Event, PushDelivery } from "@/schemas/cooler"
import { activeDevices } from "@/services/devices"
import { expoPushProvider } from "@/services/notifications/expo"
import { shouldNotify } from "@/services/preferences"

// #region Log Failed Deliveries
/**
 * logs every failed delivery
 *
 * @param deliveries delivery outcomes
 */
const logFailures = (deliveries: PushDelivery[]) => {
  for (const delivery of deliveries) {
    if (delivery.status === "error") {
      console.error(`Failed to notify device ${delivery.deviceId}:`, delivery.error)
    }
  }
}
// #endregion

// #region Dispatch Event
/**
 * dispatches an event to active devices
 *
 * @param event event to dispatch
 *
 * @docs Dispatches an event to the active linked devices that want it right
 * now, skipping devices in their quiet hours or with the event's category
 * muted, and logs any failed deliveries.
 */
export const dispatchEvent = async (event: Event) => {
  // get active linked devices that want this event now
  const devices = (await activeDevices(event)).filter((device) => shouldNotify(device.preferences, event))

  // validate user has active devices
  if (!devices || devices.length === 0) return

  // deliver via expo
  const deliveries = await expoPushProvider.send(devices, event)

  // log failed deliveries
  logFailures(deliveries)
}
// #endregion

// #region Test Event
/**
 * content of a test notification
 *
 * @docs The title and message a test notification shows on a device.
 */
export const TEST_EVENT = {
  type: "bridge.test",
  severity: "info",
  title: "Test notification",
  message: "Your bridge can reach this device.",
} as const
// #endregion

// #region Dispatch Test Event
/**
 * stores and dispatches a test event to every active device of a bridge
 *
 * preferences are skipped on purpose, a test should reach the device even in
 * quiet hours, and nothing is stored when the bridge has no active devices
 *
 * @param bridgeId bridge to test
 *
 * @returns {Promise<{ eventId: string | null, devices: number, deliveries: PushDelivery[] }>} test outcome
 *
 * @docs Stores a test event and pushes it to every active device linked to the
 * bridge, ignoring quiet hours and muted categories so a test always goes out.
 * Nothing is stored when the bridge has no active devices.
 */
export const dispatchTestEvent = async (bridgeId: string) => {
  // every active device, regardless of preferences
  const devices = await activeDevices({ bridgeId })

  // nothing to test against
  if (devices.length === 0) {
    return { eventId: null, devices: 0, deliveries: [] as PushDelivery[] }
  }

  // persist the event so the app can fetch it like any other
  const [event] = await db
    .insert(events)
    .values({ bridgeId, ...TEST_EVENT })
    .returning()

  // deliver via expo
  const deliveries = await expoPushProvider.send(devices, {
    id: event.id,
    bridgeId,
    ...TEST_EVENT,
    createdAt: event.createdAt,
  })

  // log failed deliveries
  logFailures(deliveries)

  return { eventId: event.id, devices: devices.length, deliveries }
}
// #endregion
