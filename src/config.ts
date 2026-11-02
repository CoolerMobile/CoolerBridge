import { version } from "../package.json"

// default cloud jwks discovery endpoint, used for key rotation
const defaultJwksUrl = "https://cloud.getcooler.app/.well-known/jwks.json"

// #region Service Config
/**
 * @docs Static service metadata and runtime defaults, including the service
 * name, release version, public API version, advertised capabilities, the
 * default server port, and the cloud trust settings used to verify assertions.
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
  cloud: {
    // signing algorithm for every cloud assertion
    alg: "Ed25519",
    // issuer and audience each assertion must carry
    issuer: "https://cloud.getcooler.app",
    audience: "coolerbridge",
    // jwks discovery endpoint, overridable for self-hosted clouds
    // set CLOUD_JWKS_URL empty to disable discovery entirely
    jwksUrl: Bun.env.CLOUD_JWKS_URL ?? defaultJwksUrl,
  },
} as const
// #endregion
