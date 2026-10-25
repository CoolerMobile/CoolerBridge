import { Hono } from "hono"
import { healthCheck } from "@/routes/health"
import { coolifyWebhook } from "@/routes/webhooks/coolify"
import { bridgeRoutes } from "@/routes/bridges"

const app = new Hono()

app.get("/", (context) => {
  return context.json({
    name: "CoolerBridge",
    status: "ok",
  })
})

// routes
app.route("/health", healthCheck)
app.route("/v1/webhooks/coolify", coolifyWebhook)
app.route("/v1/bridges", bridgeRoutes)

// export api
export default app
