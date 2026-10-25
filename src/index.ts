import { Hono } from "hono"
import { coolifyWebhook } from "@/routes/webhooks/coolify"

const app = new Hono()

app.get("/", (context) => {
  return context.json({
    name: "CoolerBridge",
    status: "ok",
  })
})

app.route("/v1/webhooks/coolify", coolifyWebhook)

export default app
