import { Hono } from "hono"
import { healthCheck } from "@/routes/health"
import { coolifyWebhook } from "@/webhooks/coolify"
import { bridgeRoutes } from "@/routes/bridges"
import { infoRoute } from "@/routes/info"
import { eventRoutes } from "@/routes/events"
import { pairingRoutes } from "@/routes/pair"
import { authRoutes } from "@/routes/auth"
import { deviceRoutes } from "@/routes/devices"

const app = new Hono()

// #region Root Route
/**
 * @docs Serves the service identity at the root path, returning the
 * bridge name and an ok status for a quick liveness check.
 */
app.get("/", (context) => {
  return context.json({
    name: "CoolerBridge",
    status: "ok",
  })
})
// #endregion

// #region Route Registration
/**
 * @docs Mounts every router onto the Hono app: the public info and health
 * routes, the Coolify webhook, the auth, bridge, and pairing connection
 * routes, and the events and devices data routes.
 */
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
app.route("/v1/devices", deviceRoutes)
// #endregion

// export api
export default app
