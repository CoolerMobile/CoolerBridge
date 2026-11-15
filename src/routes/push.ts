import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "@/db"
import { events } from "@/db/schema"
import { requireDevice } from "@/auth/middleware"

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
