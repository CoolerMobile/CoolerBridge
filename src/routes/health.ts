import { Hono } from "hono"

export const healthCheck = new Hono()

healthCheck.get("/", (context) => {
  return context.json({
    status: "ok",
    service: "coolerbridge",
    timestamp: new Date().toISOString(),
  })
})
