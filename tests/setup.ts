import postgres from "postgres"
import { runMigrations } from "@/db/migrate"

/**
 * global test preload
 *
 * runs once before any test file is imported. it spins up an
 * isolated test database (never the dev one) so tests can write
 * freely, and forces development mode so the auth layer loads
 * the dev keys instead of exiting
 *
 * the schema is applied with the committed migrations, the same
 * path production takes, so a schema change without a generated
 * migration fails the tests that use it
 */

// force dev mode before any module reads it
// auth/cloud loads its public key based on this
process.env.NODE_ENV = "development"

// keep the status channel and relay gate off so a local .env never reaches a live cloud
// services/contingency reads these on every check, so tests turn them on where needed
delete process.env.CLOUD_STATUS_URL
delete process.env.BRIDGE_RELAY_SECRET
delete process.env.REQUIRE_RELAY_ENTITLEMENT

// base connection from .env
const base = process.env.DATABASE_URL
if (!base) {
  throw new Error("DATABASE_URL is required to run tests")
}

// derive an isolated "<db>_test" database name
const baseUrl = new URL(base)
const baseName = baseUrl.pathname.replace("/", "")
export const testDbName = `${baseName}_test`

// url pointing at the test database
const testUrl = new URL(base)
testUrl.pathname = `/${testDbName}`

// admin connection targets the default "postgres" database
// so we can drop and recreate the test database cleanly
const adminUrl = new URL(base)
adminUrl.pathname = "/postgres"

const admin = postgres(adminUrl.toString(), { max: 1 })
await admin.unsafe(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE)`)
await admin.unsafe(`CREATE DATABASE "${testDbName}"`)
await admin.end()

// point every module at the test database
// must happen before "@/db" is imported anywhere
process.env.DATABASE_URL = testUrl.toString()

// apply the committed migrations to the fresh test database
await runMigrations(testUrl.toString())
