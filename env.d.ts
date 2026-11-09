declare const VERSION: string
declare const API_VERSION: number
declare const SERVICE_NAME: string

declare module "bun" {
  interface Env {
    DATABASE_URL: string
    CLOUD_PUBLIC_KEY?: string
    CLOUD_JWKS_URL?: string
    PAIRING_PEPPER: string
    // contingency channel (optional)
    // the cloud status endpoint and the shared bearer it expects
    CLOUD_STATUS_URL?: string
    BRIDGE_RELAY_SECRET?: string
    // keep operating when the cloud can't be reached ("true"), defaults to the moat
    CONTINGENCY_FAIL_OPEN?: string
    // how long a confirmed contingency result is cached, in ms
    CONTINGENCY_TTL_MS?: string
  }
}
