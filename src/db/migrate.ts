import { drizzle } from "drizzle-orm/postgres-js"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

// committed migrations, resolved from this file so the cwd doesn't matter
const migrationsFolder = `${import.meta.dir}/../../drizzle`

// errors meaning a statement's change is already in place
// duplicate table, column and object, undefined column and object
const ALREADY_APPLIED = new Set(["42P07", "42701", "42710", "42703", "42704"])

// #region Push Baseline
/**
 * @docs Databases created before versioned migrations were synced with
 * drizzle-kit push and carry no migration journal. On first run, every
 * committed migration is replayed one statement at a time, skipping changes
 * that are already in place, then recorded in the journal so regular
 * migrations take over from there.
 */
/**
 * whether the database was set up by push and has no migration journal
 *
 * @param sql postgres connection
 *
 * @returns true for a push-managed database
 */
const isPushManaged = async (sql: postgres.Sql) => {
  const [row] = await sql<{ legacy: boolean }[]>`
    select to_regclass('drizzle.__drizzle_migrations') is null
      and to_regclass('public.bridges') is not null as legacy
  `
  return row?.legacy ?? false
}

/**
 * replay every migration onto a push-managed database and journal them
 *
 * runs in one transaction, so a statement failing for any other reason
 * leaves the database untouched
 *
 * @param sql postgres connection
 */
const baseline = async (sql: postgres.Sql) => {
  const migrations = readMigrationFiles({ migrationsFolder })

  await sql.begin(async (tx) => {
    for (const migration of migrations) {
      for (const statement of migration.sql) {
        if (!statement.trim()) continue

        try {
          // a failed statement aborts the transaction unless it is isolated
          await tx.savepoint((savepoint) => savepoint.unsafe(statement))
        } catch (error) {
          if (!(error instanceof postgres.PostgresError) || !ALREADY_APPLIED.has(error.code)) throw error
        }
      }
    }

    // same journal drizzle's migrator creates and reads
    await tx`create schema if not exists drizzle`
    await tx`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `
    for (const migration of migrations) {
      await tx`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${migration.hash}, ${migration.folderMillis})
      `
    }
  })

  console.log(`baselined a push-managed database with ${migrations.length} migrations`)
}
// #endregion

// #region Run Migrations
/**
 * @docs Brings the database up to the latest committed migration, adopting
 * push-managed databases first. Runs on every container start before the
 * server, and through `bun db:migrate` during development.
 */
/**
 * apply pending migrations
 *
 * @param url postgres connection string
 */
export const runMigrations = async (url: string) => {
  const client = postgres(url, { max: 1, onnotice: () => undefined })

  try {
    if (await isPushManaged(client)) await baseline(client)
    await migrate(drizzle({ client }), { migrationsFolder })
  } finally {
    await client.end()
  }
}
// #endregion

if (import.meta.main) {
  await runMigrations(Bun.env.DATABASE_URL)
  console.log("migrations applied")
}
