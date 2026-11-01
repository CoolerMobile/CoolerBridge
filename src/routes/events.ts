import { and, desc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "@/db"
import { events } from "@/db/schema"
import { requireAuth, requireScopes } from "@/auth/middleware"

export const eventRoutes = new Hono()

// #region List Events Route
/**
 * @docs Returns every event for the authenticated bridge, newest first, for
 * callers holding the events:read scope.
 */
// get all events for authenticated user's bridge
eventRoutes.get("/", requireAuth, requireScopes(["events:read"]), async (context) => {
  // cloud link
  const cloudLink = context.get("cloudLink")

  // cloud-link based events
  const eventList = await db
    .select()
    .from(events)
    .where(eq(events.bridgeId, cloudLink.bridgeId))
    .orderBy(desc(events.createdAt))

  // return json-encoded event list
  return context.json(eventList)
})
// #endregion

// #region Get Event Route
/**
 * @docs Returns a single event by id, scoped to the authenticated bridge, for
 * callers holding the events:read scope.
 */
// get event data by id
eventRoutes.get("/:id", requireAuth, requireScopes(["events:read"]), async (context) => {
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
