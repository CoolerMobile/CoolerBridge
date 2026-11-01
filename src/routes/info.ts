import { Hono } from "hono"
import { config } from "@/config"

export const infoRoute = new Hono()

// #region Info Route
/**
 * @docs Reports the bridge's version, public API version, and advertised
 * capabilities.
 */
// info route for backend capabilities
infoRoute.get("/", (context) => {
  return context.json({
    version: config.service.version,
    apiVersion: config.service.apiVersion,
    capabilities: config.capabilities,
  })
})
// #endregion
