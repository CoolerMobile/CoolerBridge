export type OperatingSystem = "ios" | "android"

/**
 * a push provider delivers an event to a set of devices
 *
 * @param devices devices to deliver to
 * @param event cooler event to deliver
 *
 * @returns {PushDelivery[]} per-device delivery outcome
 */
export type PushProvider = {
  send(devices: Device[], event: Event): Promise<PushDelivery[]>
}

/**
 * outcome of a single push delivery attempt
 */
export type PushDelivery = {
  deviceId: string
  status: "ok" | "error"
  ticketId?: string
  error?: string
}

export type Bridge = {
  id: string
  secret: string
  name: string
  enabled: boolean
  createdAt: Date
}

export type Device = {
  id: string
  cloudLinkId: string
  platform: OperatingSystem
  pushToken: string
  createdAt: Date
  lastSeenAt: Date | null
}

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
