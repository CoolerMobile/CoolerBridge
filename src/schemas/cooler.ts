export type Bridge = {
  id: string
  secret: string
  name: string
  enabled: boolean
  createdAt: Date
}

export type Device = {
  id: string
  bridgeId: string
  tokenHash: string
  platform: "ios" | "android"
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
