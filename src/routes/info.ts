import { Hono } from "hono"
import { config } from "@/config"

export const infoRoute = new Hono()

// info route for backend capabilities
infoRoute.get("/", (context) => {
  return context.json({
    version: config.service.version,
    apiVersion: config.service.apiVersion,
    capabilities: config.capabilities,
  })
})
