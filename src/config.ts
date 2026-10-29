import { version } from "../package.json"

export const config = {
  service: {
    name: "CoolerBridge",
    version: version,
    apiVersion: 1,
  },
  capabilities: ["coolify-webhooks", "events"],
  server: {
    port: 3000,
  },
} as const
