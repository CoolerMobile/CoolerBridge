// #region Operating System
/**
 * @docs The mobile platforms a linked device can run, either iOS or Android.
 */
export type OperatingSystem = "ios" | "android"
// #endregion

// #region Push Provider
/**
 * a push provider delivers an event to a set of devices
 *
 * @param devices devices to deliver to
 * @param event cooler event to deliver
 *
 * @returns {PushDelivery[]} per-device delivery outcome
 *
 * @docs Contract for a push provider, delivering a Cooler event to a set of
 * devices and reporting a per-device outcome.
 */
export type PushProvider = {
  send(devices: Device[], event: Event): Promise<PushDelivery[]>
}
// #endregion

// #region Push Delivery
/**
 * outcome of a single push delivery attempt
 *
 * @docs Outcome of a single push delivery attempt, carrying the device id,
 * status, and either a ticket id or an error.
 */
export type PushDelivery = {
  deviceId: string
  status: "ok" | "error"
  ticketId?: string
  error?: string
}
// #endregion

// #region Bridge Type
/**
 * @docs Full shape of a bridge record, including its secret, display name,
 * enabled flag, and creation time.
 */
export type Bridge = {
  id: string
  secret: string
  name: string
  enabled: boolean
  createdAt: Date
}
// #endregion

// #region Device Type
/**
 * @docs A linked device, tying a cloud link to its platform, push token, and
 * activity timestamps.
 */
export type Device = {
  id: string
  cloudLinkId: string
  platform: OperatingSystem
  pushToken: string
  createdAt: Date
  lastSeenAt: Date | null
}
// #endregion

// #region Event Type
/**
 * @docs A normalized Cooler event ready for storage and delivery, carrying its
 * severity, title, message, and optional resource and metadata.
 */
export type Event = {
  id: string
  bridgeId: string
  type: string
  severity: "info" | "success" | "warning" | "error"
  title: string
  message: string
  resourceType?: string
  resourceId?: string
  resourceName?: string
  metadata?: unknown
  createdAt: Date
}
// #endregion
