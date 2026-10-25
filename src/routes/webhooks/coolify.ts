import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { coolifyWebhookSchema } from "@/schemas/coolify"
import { bridges } from "@/lib/store"
import { normalizeEvent } from "@/services/normalize"

export const coolifyWebhook = new Hono()

coolifyWebhook.post("/:bridgeId", zValidator("json", coolifyWebhookSchema), async (context) => {
  const bridgeId = context.req.param("bridgeId")
  const payload = context.req.valid("json")

  // bridge
  const bridge = bridges.get(bridgeId)

  // validate bridge id
  if (!bridge) {
    return context.json({ error: "Bridge not found" }, 404)
  }

  // normalize event
  const event = normalizeEvent(payload)

  // debug: log event
  console.log("Cooler event:", event)

  // return success
  return context.json(
    {
      received: true,
    },
    202
  )
})
