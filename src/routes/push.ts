import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "@/db"
import { events } from "@/db/schema"
import { requireAuth, requireDevice, requireScopes } from "@/auth/middleware"
import { dispatchTestEvent } from "@/services/notifications/dispatch"

export const pushRoutes = new Hono()

// #region Get Pushed Event Route
/**
 * @docs Returns a single event by id for a device presenting the push it was
 * notified with, authenticated by the device's event token and scoped to the
 * device's bridge. Pushes only carry the event id, so this is how the
 * notification gets its content.
 */
// get pushed event data by id
pushRoutes.get("/events/:id", requireDevice, async (context) => {
  // cloud link & event id
  const cloudLink = context.get("cloudLink")
  const id = context.req.param("id")

  // event
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.bridgeId, cloudLink.bridgeId)),
  })

  // validate event
  if (!event) {
    return context.json(
      {
        error: "Event not found",
      },
      404
    )
  }

  // return json-encoded event data
  return context.json(event)
})
// #endregion

// #region Test Push Route
/**
 * @docs Sends a test notification to every active device linked to the
 * session's bridge, ignoring quiet hours and muted categories, and reports
 * how each delivery went. The test is stored as an event, so it shows up in
 * the app like any other. Requires the push:test scope.
 */
// send a test push to every linked device
pushRoutes.post("/test", requireAuth, requireScopes(["push:test"]), async (context) => {
  // cloud link
  const cloudLink = context.get("cloudLink")

  // store & dispatch the test event
  const { eventId, devices, deliveries } = await dispatchTestEvent(cloudLink.bridgeId)

  // return delivery outcome
  return context.json({
    eventId,
    devices,
    delivered: deliveries.filter((delivery) => delivery.status === "ok").length,
    failed: deliveries.filter((delivery) => delivery.status === "error").length,
    deliveries,
  })
})
// #endregion
