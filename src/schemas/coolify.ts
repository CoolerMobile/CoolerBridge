import { z } from "zod"

export const coolifyWebhookSchema = z.object({
  success: z.boolean(),
  event: z.string(),
  message: z.string(),

  // Event-dependent fields
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
