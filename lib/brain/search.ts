import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";

export type SnippetPart = { text: string; hit: boolean };
export type SearchHit = { path: string; title: string; snippet: SnippetPart[] };

const START = "\u0002";
const END = "\u0003";
const MAX_TOKENS = 8;

/** User input → safe FTS5 query: words only, each quoted with prefix matching, ANDed. */
export function toMatchQuery(input: string): string | null {
  const tokens = (input.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_TOKENS);
  return tokens.length > 0 ? tokens.map((token) => `"${token}"*`).join(" ") : null;
}

/** Splits an FTS snippet into plain and highlighted parts (rendered as text, never HTML). */
export function splitSnippet(raw: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  for (const [index, chunk] of raw.split(START).entries()) {
    if (index === 0) {
      if (chunk) parts.push({ text: chunk, hit: false });
      continue;
    }
    const [hit = "", rest = ""] = chunk.split(END);
    if (hit) parts.push({ text: hit, hit: true });
    if (rest) parts.push({ text: rest, hit: false });
  }
  return parts;
}

/** Full-text search over titles and bodies, best matches first. */
export function searchBrain(db: Db, input: string, limit = 20): SearchHit[] {
  const match = toMatchQuery(input.slice(0, 200));
  if (!match) return [];
  const cappedLimit = Number.isFinite(limit) ? Math.max(0, Math.min(20, Math.trunc(limit))) : 20;
  const rows = db.all<{ path: string; title: string; snippet: string }>(sql`
    SELECT path, title, snippet(brain_fts, 2, ${START}, ${END}, '…', 12) AS snippet
    FROM brain_fts WHERE brain_fts MATCH ${match} ORDER BY rank LIMIT ${cappedLimit}`);
  return rows.map((row) => ({
    path: row.path,
    title: row.title,
    snippet: splitSnippet(row.snippet),
  }));
}
