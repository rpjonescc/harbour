import type { Db } from "@/lib/db/client";
import { buildOutsideFacts, type OutsideFacts } from "./facts";
import { readChecks } from "./store";

const READ_DAYS = 60;

/** The product's outside-view history as the rules judge it. */
export function readOutsideFacts(db: Db, productId: string, now: Date): OutsideFacts {
  return buildOutsideFacts(
    readChecks(db, productId, "backlinks", READ_DAYS, now),
    readChecks(db, productId, "ai_answer", READ_DAYS, now),
  );
}
