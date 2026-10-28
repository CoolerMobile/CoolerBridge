import { Hono } from "hono"
import { healthCheck } from "@/routes/health"
import { coolifyWebhook } from "@/webhooks/coolify"
import { bridgeRoutes } from "@/routes/bridges"
import { infoRoute } from "@/routes/info"
import { eventRoutes } from "@/routes/events"
import { pairingRoutes } from "@/routes/pair"
import { authRoutes } from "./routes/auth"

const app = new Hono()

app.get("/", (context) => {
  return context.json({
    name: "CoolerBridge",
    status: "ok",
  })
})

// basic routes
app.route("/info", infoRoute)
app.route("/health", healthCheck)

// webhooks
app.route("/v1/webhooks/coolify", coolifyWebhook)

// connection
app.route("/v1/auth", authRoutes)
app.route("/v1/bridges", bridgeRoutes)
app.route("/v1/pairing", pairingRoutes)

// data
app.route("/v1/events", eventRoutes)

// export api
export default app
