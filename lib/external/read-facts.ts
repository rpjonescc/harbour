import type { Db } from "@/lib/db/client";
import { siteKey } from "@/lib/scan/site";
import { buildOutsideFacts, type OutsideFacts } from "./facts";
import { readChecks } from "./store";

const READ_DAYS = 60;

/**
 * The product's outside-view history as the rules judge it: links to its current domain only (an
 * old address says nothing about this one) and AI answers to the questions tracked now, when they
 * are known.
 */
export function readOutsideFacts(
  db: Db,
  product: { id: string; url: string },
  questions: readonly string[] | null,
  now: Date,
): OutsideFacts {
  const domain = siteKey(new URL(product.url).hostname);
  const backlinks = readChecks(db, product.id, "backlinks", READ_DAYS, now).filter(
    (row) => siteKey(row.subject) === domain,
  );
  const answers = readChecks(db, product.id, "ai_answer", READ_DAYS, now).filter(
    (row) => questions === null || questions.includes(row.subject),
  );
  return buildOutsideFacts(backlinks, answers);
}
