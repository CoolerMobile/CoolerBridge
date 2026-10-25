import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { coolifyWebhookSchema } from "@/schemas/coolify"

export const coolifyWebhook = new Hono()

coolifyWebhook.post("/:bridgeId", zValidator("json", coolifyWebhookSchema), async (context) => {
  const bridgeId = context.req.param("bridgeId")
  const payload = context.req.valid("json")

  console.log("Coolify webhook:", {
    bridgeId,
    event: payload.event,
    success: payload.success,
    message: payload.message,
  })

  return context.json({
    received: true,
  })
})
