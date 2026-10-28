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

// pairing challenges table
export const pairingChallenges = pgTable("pairing_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeDigest: text("code_digest").notNull().unique(),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }).notNull(),
  usedAt: timestamp("used_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
})

// cloud links table
export const cloudLinks = pgTable("cloud_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  cloudUserId: text("cloud_user_id").notNull(),
  cloudBridgeId: text("cloud_bridge_id").notNull().unique(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", {
    withTimezone: true,
  }),
})

// sessions table
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  cloudLinkId: uuid("cloud_link_id")
    .notNull()
    .references(() => cloudLinks.id, {
      onDelete: "cascade",
    }),
  tokenDigest: text("token_digest").notNull().unique(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }).notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", {
    withTimezone: true,
  }),
  revokedAt: timestamp("revoked_at", {
    withTimezone: true,
  }),
})
