import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns";

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  login: text("login").notNull(),
  createdAt: timestamp("created_at").notNull(),
  lastSeenAt: timestamp("last_seen_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  // The passkey that signed this session in; removing that passkey revokes the session.
  passkeyId: text("passkey_id"),
});

export const passkeys = sqliteTable("passkeys", {
  id: text("id").primaryKey(),
  login: text("login").notNull(),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  counter: integer("counter").notNull(),
  transports: text("transports", { mode: "json" }).$type<string[]>(),
  deviceLabel: text("device_label").notNull(),
  createdAt: timestamp("created_at").notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export const authChallenges = sqliteTable("auth_challenges", {
  flowId: text("flow_id").primaryKey(),
  kind: text("kind", { enum: ["register", "authenticate"] }).notNull(),
  login: text("login").notNull(),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const setupTokens = sqliteTable("setup_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: timestamp("at").notNull(),
  login: text("login"),
  event: text("event").notNull(),
  detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
});
