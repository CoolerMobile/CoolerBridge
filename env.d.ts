declare const VERSION: string
declare const API_VERSION: number
declare const SERVICE_NAME: string

declare module "bun" {
  interface Env {
    DATABASE_URL: string
    CLOUD_PUBLIC_KEY: string
    PAIRING_PEPPER: string
  }
}
