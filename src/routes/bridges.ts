import { Hono } from "hono"
import { bridges } from "@/lib/store"

export const bridgeRoutes = new Hono()

// creates a cryptographically-random id and creates
// a new bridge with that same id, storing it
bridgeRoutes.post("/", (context) => {
  // cryptographically random id
  const id = `brg_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`

  // bridge
  const bridge = { id, createdAt: new Date().toISOString() }
  bridges.set(id, bridge)

  // return bridge if created
  return context.json(
    {
      ...bridge,
      webhookUrl: `v1/webhooks/coolify/${id}`,
    },
    201
  )
})
