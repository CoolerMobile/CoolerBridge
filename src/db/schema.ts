import { OperatingSystem } from "@/schemas/cooler"
import { BridgeScope } from "@/services/scopes"
import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

// #region Event Severity Enum
/**
 * @docs Database enum for an event's severity level, from informational
 * through error.
 */
export const eventSeverity = pgEnum("event_severity", ["info", "success", "warning", "error"])
// #endregion

// #region Resource Type Enum
/**
 * @docs Database enum for the kind of Coolify resource an event refers to.
 */
export const resourceType = pgEnum("resource_type", ["application", "database", "server", "container"])
// #endregion

// #region Bridges Table
/**
 * @docs The registry of linked Coolify instances; each row owns a unique
 * webhook secret and an enabled flag.
 */
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
// #endregion

// #region Events Table
/**
 * @docs Stored events scoped to a bridge, holding the normalized type,
 * severity, message, and optional resource details.
 */
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
// #endregion

// #region Pairing Challenges Table
/**
 * @docs Short-lived pairing challenges, tracking a code digest with its expiry
 * and single-use consumption timestamp.
 */
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
// #endregion

// #region Cloud Links Table
/**
 * @docs Links a CoolerCloud user and bridge once a pairing completes, with
 * revocation support.
 */
// cloud links table
export const cloudLinks = pgTable("cloud_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  cloudUserId: text("cloud_user_id").notNull(),
  bridgeId: text("bridge_id").notNull().unique(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", {
    withTimezone: true,
  }),
})
// #endregion

// #region Sessions Table
/**
 * @docs Scoped access sessions issued per cloud link, tracking the token
 * digest, granted scopes, expiry, and revocation.
 */
// sessions table
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  cloudLinkId: uuid("cloud_link_id")
    .notNull()
    .references(() => cloudLinks.id, {
      onDelete: "cascade",
    }),
  tokenDigest: text("token_digest").notNull().unique(),
  scopes: jsonb("scopes").$type<BridgeScope[]>().notNull().default([]),
  bridgeId: uuid("bridge_id")
    .notNull()
    .references(() => bridges.id, {
      onDelete: "cascade",
    }),
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
// #endregion

// #region Devices Table
/**
 * @docs Registered push targets per cloud link, holding the platform and Expo
 * push token with activity and revocation timestamps.
 */
// devices table
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  cloudLinkId: uuid("cloud_link_id")
    .notNull()
    .references(() => cloudLinks.id, {
      onDelete: "cascade",
    }),
  platform: text().$type<OperatingSystem>().notNull(),
  pushToken: text().notNull().unique(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", {
    withTimezone: true,
  }),
  revokedAt: timestamp("revoked_at", {
    withTimezone: true,
  }),
})
// #endregion
