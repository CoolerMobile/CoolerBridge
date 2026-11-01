import { Hono } from "hono"

export const healthCheck = new Hono()

// #region Health Check Route
/**
 * @docs Reports service liveness with a status, service name, and current
 * timestamp.
 */
healthCheck.get("/", (context) => {
  return context.json({
    status: "ok",
    service: "coolerbridge",
    timestamp: new Date().toISOString(),
  })
})
// #endregion
