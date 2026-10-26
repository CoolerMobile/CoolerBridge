import { Hono } from "hono"
import { healthCheck } from "@/routes/health"
import { coolifyWebhook } from "@/routes/webhooks/coolify"
import { bridgeRoutes } from "@/routes/bridges"
import { infoRoute } from "@/routes/info"
import { eventRoutes } from "@/routes/events"

const app = new Hono()

app.get("/", (context) => {
  return context.json({
    name: "CoolerBridge",
    status: "ok",
  })
})

// routes
app.route("/info", infoRoute)
app.route("/health", healthCheck)
app.route("/v1/webhooks/coolify", coolifyWebhook)
app.route("/v1/bridges", bridgeRoutes)
app.route("/v1/events", eventRoutes)

// export api
export default app
