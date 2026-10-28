import { desc } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "@/db"
import { events } from "@/db/schema"
import { requireAuth, requireScope } from "@/auth/middleware"

export const eventRoutes = new Hono()

// apply auth-gate & scope-gate
eventRoutes.use("*", requireAuth)
eventRoutes.use("*", requireScope("events:read"))

// get event data
eventRoutes.get("/", async (context) => {
  // data
  const data = await db.select().from(events).orderBy(desc(events.createdAt))

  // return data
  return context.json(data)
})
