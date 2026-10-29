export type OperatingSystem = "ios" | "android"

export type PushProvider = "apns" | "fcm"

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
  pushProvider?: PushProvider
  pushToken?: string
  createdAt: Date
  lastSeenAt: Date
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
