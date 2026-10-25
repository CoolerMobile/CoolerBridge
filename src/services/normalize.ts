import { CoolifyWebhook } from "@/schemas/coolify"

export type CoolerEvent = {
  type: string
  severity: "info" | "success" | "warning" | "error"
  title: string
  message: string
  createdAt: string
  resource?: {
    id?: string
    name?: string
    type: "application" | "database" | "server" | "container"
  }
  metadata?: Record<string, unknown>
}

/**
 * normalizes coolify event payloads into
 * cooler-native events
 */
export const normalizeEvent = (payload: CoolifyWebhook): CoolerEvent => {
  switch (payload.event) {
    // success
    case "deployment_success":
      return {
        type: "deployment_success",
        severity: "success",
        title: "Deployment successful",
        message: payload.message,
        createdAt: new Date().toISOString(),
        resource: {
          id: payload.application_uuid,
          name: payload.application_name,
          type: "application",
        },
        metadata: {
          deploymentId: payload.deployment_uuid,
        },
      }

    // failure
    case "deployment_failed":
      return {
        type: "deployment.failed",
        severity: "error",
        title: "Deployment failed",
        message: payload.message,
        createdAt: new Date().toISOString(),
        resource: {
          id: payload.application_uuid,
          name: payload.application_name,
          type: "application",
        },
      }

    // unable to determine, return raw
    default:
      return {
        type: `coolify.${payload.event}`,
        severity: payload.success ? "info" : "error",
        title: payload.event,
        message: payload.message,
        createdAt: new Date().toISOString(),
      }
  }
}
