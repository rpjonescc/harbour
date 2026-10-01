import { integer } from "drizzle-orm/sqlite-core";

/** A millisecond timestamp column, read as a Date. */
export const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
