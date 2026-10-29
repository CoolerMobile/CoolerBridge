import postgres from "postgres"

/**
 * global test preload
 *
 * runs once before any test file is imported. it spins up an
 * isolated test database (never the dev one) so tests can write
 * freely, and forces development mode so the auth layer loads
 * the dev keys instead of exiting
 *
 * the schema is applied straight from src/db/schema.ts with
 * drizzle-kit push, so tests always track the live schema rather
 * than the committed migrations
 */

// force dev mode before any module reads it
// auth/cloud loads its public key based on this
process.env.NODE_ENV = "development"

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
// must happen before "@/db" is imported anywhere and before
// drizzle-kit push reads the connection string
process.env.DATABASE_URL = testUrl.toString()

// apply the current schema to the fresh test database
const push = Bun.spawn(["bunx", "drizzle-kit", "push", "--force"], {
  env: process.env,
  stdout: "pipe",
  stderr: "pipe",
})

const pushCode = await push.exited
if (pushCode !== 0) {
  const err = await new Response(push.stderr).text()
  throw new Error(`drizzle-kit push failed (${pushCode}):\n${err}`)
}
