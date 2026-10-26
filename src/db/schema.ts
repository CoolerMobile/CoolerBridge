import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

// events & resources
export const eventSeverity = pgEnum("event_severity", ["info", "success", "warning", "error"])
export const resourceType = pgEnum("resource_type", ["application", "database", "server", "container"])

// bridges table
export const bridges = pgTable("bridges", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("Coolify"),
  secret: text("secret").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
})

// events table
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  bridgeId: uuid("bridge_id")
    .notNull()
    .references(() => bridges.id, {
      onDelete: "cascade",
    }),
  type: text("type").notNull(),
  severity: eventSeverity("severity").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  resourceType: resourceType("resource_type"),
  resourceId: text("resource_id"),
  resourceName: text("resource_name"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
})
