import { version } from "../package.json"

// #region Service Config
/**
 * @docs Static service metadata and runtime defaults, including the service
 * name, release version, public API version, advertised capabilities, and
 * the default server port.
 */
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
// #endregion
