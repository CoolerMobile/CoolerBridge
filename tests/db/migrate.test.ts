import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readMigrationFiles } from "drizzle-orm/migrator"
import postgres from "postgres"
import { runMigrations } from "@/db/migrate"

const migrations = readMigrationFiles({ migrationsFolder: `${import.meta.dir}/../../drizzle` })

// scratch database next to the test one, so the shared schema stays untouched
const testUrl = new URL(process.env.DATABASE_URL!)
const scratchName = `${testUrl.pathname.replace("/", "")}_migrate`

const scratchUrl = new URL(testUrl)
scratchUrl.pathname = `/${scratchName}`

const adminUrl = new URL(testUrl)
adminUrl.pathname = "/postgres"

/**
 * recreate the scratch database empty
 */
const resetScratch = async () => {
  const admin = postgres(adminUrl.toString(), { max: 1 })
  await admin.unsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`)
  await admin.unsafe(`CREATE DATABASE "${scratchName}"`)
  await admin.end()
}

/**
 * open a connection, run a callback against it and close it
 *
 * @param callback work to run on the connection
 */
const withScratch = async <T>(callback: (sql: postgres.Sql) => Promise<T>) => {
  const sql = postgres(scratchUrl.toString(), { max: 1, onnotice: () => undefined })
  try {
    return await callback(sql)
  } finally {
    await sql.end()
  }
}

/**
 * names of the columns on the devices table
 *
 * @param sql scratch connection
 */
const deviceColumns = async (sql: postgres.Sql) => {
  const rows = await sql<{ column_name: string }[]>`
    select column_name from information_schema.columns where table_name = 'devices'
  `
  return rows.map((row) => row.column_name)
}

/**
 * number of migrations recorded in the journal
 *
 * @param sql scratch connection
 */
const journalSize = async (sql: postgres.Sql) => {
  const [row] = await sql<
    { count: number }[]
  >`select count(*)::int as count from drizzle.__drizzle_migrations`
  return row!.count
}

beforeAll(resetScratch)

afterAll(async () => {
  const admin = postgres(adminUrl.toString(), { max: 1 })
  await admin.unsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`)
  await admin.end()
})

describe("runMigrations", () => {
  test("applies every migration to an empty database", async () => {
    await resetScratch()
    await runMigrations(scratchUrl.toString())

    await withScratch(async (sql) => {
      expect(await journalSize(sql)).toBe(migrations.length)
      expect(await deviceColumns(sql)).toContain("preferences")
    })
  })

  test("baselines a push-managed database that missed later changes", async () => {
    await resetScratch()

    // what push left behind before event tokens, with no journal and a device row
    await withScratch(async (sql) => {
      for (const migration of migrations.slice(0, 5)) {
        for (const statement of migration.sql) await sql.unsafe(statement)
      }

      const [bridge] = await sql`insert into bridges (secret) values ('secret') returning id`
      const [link] = await sql`
        insert into cloud_links (cloud_user_id, bridge_id) values ('usr_test', ${bridge!.id}) returning id
      `
      await sql`
        insert into devices (cloud_link_id, platform, "pushToken")
        values (${link!.id}, 'ios', 'ExponentPushToken[legacy]')
      `
    })

    await runMigrations(scratchUrl.toString())

    await withScratch(async (sql) => {
      expect(await deviceColumns(sql)).toEqual(expect.arrayContaining(["event_token_digest", "preferences"]))
      expect(await journalSize(sql)).toBe(migrations.length)

      // existing rows survive the baseline
      const devices = await sql`select "pushToken" from devices`
      expect(devices).toHaveLength(1)
    })
  })

  test("is a no-op once the database is up to date", async () => {
    await runMigrations(scratchUrl.toString())

    await withScratch(async (sql) => {
      expect(await journalSize(sql)).toBe(migrations.length)
    })
  })
})
