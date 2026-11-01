import { Hono } from "hono"
import { db } from "@/db"
import { bridges } from "@/db/schema"
import { genSecret } from "@/services/secrets"

export const bridgeRoutes = new Hono()

// #region Create Bridge Route
/**
 * @docs Creates a new bridge with a cryptographically random secret and returns
 * its id, name, and webhook URL.
 */
// creates a new bridge with a random secret id
bridgeRoutes.post("/", async (context) => {
  // cryptographically random id
  const randomId = genSecret()

  // bridge
  const [bridge] = await db.insert(bridges).values({ secret: randomId }).returning()

  // validate creation
  if (!bridge) {
    return context.json(
      {
        error: "Failed to create bridge",
      },
      500
    )
  }

  // bridge created
  return context.json(
    {
      id: bridge.id,
      name: bridge.name,
      createdAt: bridge.createdAt,
      webhookUrl: `/v1/webhooks/coolify/${bridge.secret}`,
    },
    201
  )
})
// #endregion
