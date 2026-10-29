import { eq } from "drizzle-orm"
import { db } from "@/db"
import { bridges, events } from "@/db/schema"
import { Hono } from "hono"
import { coolifyWebhookSchema } from "@/schemas/coolify"
import { zValidator } from "@hono/zod-validator"
import { normalizeEvent } from "@/services/normalize"

export const coolifyWebhook = new Hono()

coolifyWebhook.post("/:secret", zValidator("json", coolifyWebhookSchema), async (context) => {
  // secret
  const payload = context.req.valid("json")
  const secret = context.req.param("secret")

  // bridge
  const bridge = await db.query.bridges.findFirst({
    where: eq(bridges.secret, secret),
  })

  // validate bridge
  if (!bridge || !bridge.enabled) {
    return context.json(
      {
        error: "Bridge not found",
      },
      404
    )
  }

  // normalize event
  const normalized = normalizeEvent(payload)

  // persist event
  const [event] = await db
    .insert(events)
    .values({
      bridgeId: bridge.id,
      type: normalized.type,
      severity: normalized.severity,
      title: normalized.title,
      message: normalized.message,
      resourceType: normalized.resource?.type,
      resourceId: normalized.resource?.id,
      resourceName: normalized.resource?.name,
      metadata: normalized.metadata,
    })
    .returning()

  // return success
  return context.json(
    {
      received: true,
      eventId: event?.id,
    },
    202
  )
})
