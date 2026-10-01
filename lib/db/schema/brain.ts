import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamp } from "./columns";

export const brainDocs = sqliteTable("brain_docs", {
  path: text("path").primaryKey(),
  title: text("title").notNull(),
  mtime: timestamp("mtime").notNull(),
  contentHash: text("content_hash").notNull(),
  lastViewedAt: timestamp("last_viewed_at"),
});

export const brainLinks = sqliteTable(
  "brain_links",
  {
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fromPath, table.toPath] })],
);
