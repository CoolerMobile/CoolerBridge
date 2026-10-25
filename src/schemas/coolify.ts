import { z } from "zod"

/**
 * dependent on coolify's documented
 * webhook payload reference
 *
 * @see https://coolify.io/docs/core/notifications/channels/webhook/payload-reference
 */
export const coolifyWebhookSchema = z.object({
  success: z.boolean(),
  event: z.string(),
  message: z.string(),

  // event-dependent fields
  application_name: z.string().optional(),
  application_uuid: z.string().optional(),
  deployment_uuid: z.string().optional(),
  deployment_url: z.string().optional(),
  project: z.string().optional(),
  environment: z.string().optional(),
  fqdn: z.string().optional(),

  database_name: z.string().optional(),
  database_uuid: z.string().optional(),

  server_name: z.string().optional(),
  server_uuid: z.string().optional(),

  container_name: z.string().optional(),

  url: z.string().optional(),
})

export type CoolifyWebhook = z.infer<typeof coolifyWebhookSchema>
