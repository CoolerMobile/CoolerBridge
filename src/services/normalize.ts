import { CoolifyWebhook } from "@/schemas/coolify"

// #region Cooler Event Type
/**
 * @docs The normalized, Cooler-native shape an event takes once a Coolify
 * payload is translated.
 */
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
  // alert category a device can mute, not stored
  category?: EventCategory
}
// #endregion

// #region Coolify Events
/**
 * known coolify events and how each one reads on a device
 *
 * type overrides keep the identifiers already stored for deployments
 *
 * @see https://coolify.io/docs/core/notifications/channels/webhook/payload-reference
 *
 * @docs Every documented Coolify event with its notification title, severity
 * and the kind of resource it refers to.
 */
export const coolifyEvents: Record<
  string,
  {
    title: string
    severity?: CoolerEvent["severity"]
    resource?: NonNullable<CoolerEvent["resource"]>["type"]
    type?: string
  }
> = {
  // application deployments and status
  deployment_success: {
    title: "Deployment successful",
    severity: "success",
    resource: "application",
    type: "deployment_success",
  },
  deployment_failed: {
    title: "Deployment failed",
    severity: "error",
    resource: "application",
    type: "deployment.failed",
  },
  status_changed: { title: "Resource stopped", severity: "error", resource: "application" },
  restart_limit_reached: { title: "Restart limit reached", severity: "error", resource: "application" },

  // database backups
  backup_success: { title: "Backup successful", severity: "success", resource: "database" },
  backup_failed: { title: "Backup failed", severity: "error", resource: "database" },
  backup_success_with_s3_warning: {
    title: "Backup S3 upload failed",
    severity: "warning",
    resource: "database",
  },

  // scheduled tasks
  task_success: { title: "Scheduled task successful", severity: "success" },
  task_failed: { title: "Scheduled task failed", severity: "error" },
  task_disabled: { title: "Scheduled task disabled", severity: "error" },

  // docker cleanup
  docker_cleanup_success: { title: "Docker cleanup successful", severity: "success", resource: "server" },
  docker_cleanup_failed: { title: "Docker cleanup failed", severity: "error", resource: "server" },

  // recovery
  task_recovered: { title: "Scheduled task recovered", severity: "success" },
  backup_recovered: { title: "Backup recovered", severity: "success", resource: "database" },
  volume_backup_recovered: { title: "Volume backup recovered", severity: "success" },
  docker_cleanup_recovered: { title: "Docker cleanup recovered", severity: "success", resource: "server" },

  // servers
  server_reachable: { title: "Server reachable", severity: "success", resource: "server" },
  server_unreachable: { title: "Server unreachable", severity: "error", resource: "server" },
  server_ssh_host_key_changed: { title: "SSH host key changed", severity: "error", resource: "server" },
  high_disk_usage: { title: "High disk usage", severity: "warning", resource: "server" },
  server_patch_check: { title: "Server patches available", severity: "warning", resource: "server" },
  server_patch_check_error: { title: "Server patch check failed", severity: "error", resource: "server" },
  traefik_version_outdated: { title: "Traefik proxy outdated", severity: "warning" },

  // containers
  container_restarted: { title: "Container restarted", severity: "warning", resource: "container" },

  // image vulnerabilities
  image_exploited_problem: { title: "Exploited vulnerability found", severity: "error" },
  image_vulnerabilities_digest: { title: "Security digest", severity: "warning" },

  // always sent
  api_token_failing: { title: "API token failing", severity: "warning" },
  general: { title: "Coolify" },
  test: { title: "Test notification", severity: "info" },
}
// #endregion

// #region Event Category
/**
 * alert categories a device can mute, matching cooler's alert settings
 *
 * @docs The alert categories a device can turn off in Cooler's settings.
 */
export type EventCategory = "deployments" | "backups" | "scheduledTasks" | "servers"

/**
 * picks the alert category of a coolify event
 *
 * events coolify always sends, and events this bridge does not know yet, have
 * no category so they can never be muted by accident
 *
 * @param event raw coolify event identifier
 *
 * @returns {EventCategory | undefined} category or undefined when it cannot be muted
 *
 * @docs Maps a Coolify event to the alert category a device can turn off.
 * Events Coolify always sends (general messages, tests and failing API tokens)
 * and events this bridge does not know yet belong to no category, so they are
 * always delivered.
 */
export const eventCategory = (event: string): EventCategory | undefined => {
  if (!coolifyEvents[event] || ["general", "test", "api_token_failing"].includes(event)) return undefined

  if (event.includes("backup")) return "backups"
  if (event.startsWith("task_")) return "scheduledTasks"
  if (
    event.startsWith("deployment") ||
    ["status_changed", "restart_limit_reached", "container_restarted"].includes(event)
  ) {
    return "deployments"
  }

  return "servers"
}
// #endregion

// #region Humanize Event
/**
 * turns a raw event identifier into a readable title
 *
 * @param event raw coolify event identifier
 *
 * @returns {string} readable title
 *
 * @docs Turns an unknown event identifier such as `some_new_event` into a
 * readable title such as "Some new event".
 */
export const humanizeEvent = (event: string): string => {
  const words = event.replace(/[_.-]+/g, " ").trim()

  // nothing readable left
  if (!words) return "Coolify notification"

  return words.charAt(0).toUpperCase() + words.slice(1)
}
// #endregion

// #region Resolve Resource
/**
 * picks the resource fields matching a resource kind
 *
 * @param payload coolify webhook payload
 * @param kind resource kind the event refers to
 *
 * @returns {CoolerEvent["resource"]} resource or undefined when the payload carries none
 *
 * @docs Reads the identifier and name of the resource an event refers to from
 * the matching payload fields.
 */
const resolveResource = (
  payload: CoolifyWebhook,
  kind?: NonNullable<CoolerEvent["resource"]>["type"]
): CoolerEvent["resource"] => {
  if (!kind) return undefined

  const fields = {
    application: { id: payload.application_uuid, name: payload.application_name },
    database: { id: payload.database_uuid, name: payload.database_name },
    server: { id: payload.server_uuid, name: payload.server_name },
    container: { id: undefined, name: payload.container_name },
  }[kind]

  // payload did not identify the resource
  if (!fields.id && !fields.name) return undefined

  return { ...fields, type: kind }
}
// #endregion

// #region Collect Metadata
/**
 * keeps every payload field outside the common envelope as metadata
 *
 * keys are camel cased and a `_uuid` suffix becomes `Id`, so `deployment_uuid`
 * is stored as `deploymentId`
 *
 * @param payload coolify webhook payload
 *
 * @returns {CoolerEvent["metadata"]} metadata or undefined when the payload carries none
 *
 * @docs Keeps every field Coolify sends beyond `success`, `event` and `message`
 * as event metadata, with camel cased keys and `_uuid` suffixes renamed to `Id`
 * (for example `deployment_uuid` becomes `deploymentId`).
 */
export const collectMetadata = (payload: CoolifyWebhook): CoolerEvent["metadata"] => {
  const entries = Object.entries(payload)
    .filter(([key, value]) => !["success", "event", "message"].includes(key) && value != null)
    .map(([key, value]) => {
      const name = key
        .replace(/_uuid$/, "_id")
        .replace(/_+([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())

      return [name, value] as const
    })

  // nothing beyond the envelope
  if (entries.length === 0) return undefined

  return Object.fromEntries(entries)
}
// #endregion

// #region Normalize Event
/**
 * normalizes coolify event payloads into cooler-native events
 *
 * @docs Translates a Coolify webhook payload into a normalized Cooler event,
 * mapping known event types and falling back to a readable passthrough.
 */
export const normalizeEvent = (payload: CoolifyWebhook): CoolerEvent => {
  const known = coolifyEvents[payload.event]

  return {
    type: known?.type ?? `coolify.${payload.event}`,
    severity: known?.severity ?? (payload.success ? "info" : "error"),
    title: known?.title ?? humanizeEvent(payload.event),
    message: payload.message,
    createdAt: new Date().toISOString(),
    resource: resolveResource(payload, known?.resource),
    metadata: collectMetadata(payload),
    category: eventCategory(payload.event),
  }
}
// #endregion
