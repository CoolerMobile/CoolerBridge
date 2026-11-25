import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { bridges, cloudLinks, events } from "@/db/schema"
import { Hono } from "hono"
import { coolifyWebhookSchema } from "@/schemas/coolify"
import { zValidator } from "@hono/zod-validator"
import { normalizeEvent } from "@/services/normalize"
import { dispatchEvent } from "@/services/notifications/dispatch"
import { isContingencyActive, isRelayEntitled, isRelayGated } from "@/services/contingency"

export const coolifyWebhook = new Hono()

// #region Coolify Webhook Handler
/**
 * @docs Receives a Coolify notification at a secret-scoped URL, resolves the
 * owning bridge, normalizes and stores the event, and dispatches push
 * notifications to linked devices. On the hosted relay, the bridge must be
 * linked to an account holding the relay plan, otherwise nothing is stored or
 * sent.
 */
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

  // contingency gate - a raised moat stops the relay before it stores or dispatches
  const link = await db.query.cloudLinks.findFirst({
    where: and(eq(cloudLinks.bridgeId, bridge.id), isNull(cloudLinks.revokedAt)),
  })
  if (link && (await isContingencyActive({ cloudUserId: link.cloudUserId, bridgeId: link.bridgeId }))) {
    return context.json(
      {
        error: "Account in contingency mode",
      },
      423
    )
  }

  // relay gate - the hosted relay only stores and dispatches for relay plan holders
  if (isRelayGated()) {
    if (!link) {
      return context.json(
        {
          error: "Bridge is not linked to an account",
        },
        403
      )
    }

    if (!(await isRelayEntitled({ cloudUserId: link.cloudUserId, bridgeId: link.bridgeId }))) {
      return context.json(
        {
          error: "The hosted relay isn't available for this account",
        },
        402
      )
    }
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

  // dispatch push notifications to linked active devices
  await dispatchEvent({
    id: event.id,
    bridgeId: bridge.id,
    type: normalized.type,
    severity: normalized.severity,
    title: normalized.title,
    message: normalized.message,
    resourceType: normalized.resource?.type,
    resourceId: normalized.resource?.id,
    resourceName: normalized.resource?.name,
    metadata: normalized.metadata,
    category: normalized.category,
    createdAt: event.createdAt,
  })

  // return success
  return context.json(
    {
      received: true,
      eventId: event?.id,
    },
    202
  )
})
// #endregion
