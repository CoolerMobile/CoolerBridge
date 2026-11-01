import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "@/db/schema"

// #region Database Client
/**
 * @docs Initializes the Postgres client and the Drizzle database instance bound
 * to the full schema.
 */
const client = postgres(Bun.env.DATABASE_URL)

export const db = drizzle({
  client,
  schema,
})
// #endregion
