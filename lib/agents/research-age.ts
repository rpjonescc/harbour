// How old each research document is, from its `researched` frontmatter. Used by the web (the
// Agents panel) and the worker (the monthly refresh), so it only reads files.

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { readDoc } from "@/lib/brain/docs";
import { parseDay } from "@/lib/format/zoned-time";
import { RESEARCH_TOPICS } from "./topics";

/** A document is due for a refresh this many days after its `researched` date. */
export const REFRESH_AFTER_DAYS = 30;
/** Most refreshes queued at once: per scheduled round and per click. */
export const MAX_REFRESHES = 3;

const DAY_MS = 24 * 60 * 60_000;

export type TopicAge = {
  topicId: string;
  title: string;
  path: string;
  exists: boolean;
  /** YYYY-MM-DD, or null when the document has no readable date. */
  researched: string | null;
};

function isMissing(root: string, path: string): boolean {
  try {
    lstatSync(join(root, path));
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

/** The document's `researched` date, or null when the file or its frontmatter can't be read. */
function researchedDate(root: string, path: string): string | null {
  try {
    const doc = readDoc(root, path); // frontmatter validated with zod: a date or nothing
    const day = doc.frontmatter.researched;
    if (!day) return null;
    parseDay(day); // throws on an impossible date such as 2026-02-30
    return day;
  } catch {
    return null;
  }
}

/** Each RESEARCH_TOPICS document's `researched` date, read with readDoc (unreadable → exists, null). */
export function topicAges(root: string): TopicAge[] {
  return RESEARCH_TOPICS.map((topic) => {
    const exists = !isMissing(root, topic.path);
    return {
      topicId: topic.id,
      title: topic.title,
      path: topic.path,
      exists,
      researched: exists ? researchedDate(root, topic.path) : null,
    };
  });
}

/** Pure: existing docs researched more than 30 days before `today` (or with no date), oldest first, ≤ `limit`. */
export function staleTopics(
  ages: readonly TopicAge[],
  today: string,
  limit = Number.POSITIVE_INFINITY,
): TopicAge[] {
  const cutoff = parseDay(today) - REFRESH_AFTER_DAYS * DAY_MS;
  // An unknown date sorts first: it may be the oldest of all.
  const sortKey = (age: TopicAge) => (age.researched === null ? "" : age.researched);
  return ages
    .filter((age) => age.exists && (age.researched === null || parseDay(age.researched) < cutoff))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .slice(0, limit);
}
