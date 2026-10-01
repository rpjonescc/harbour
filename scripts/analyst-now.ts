import { pathToFileURL } from "node:url";
import { enqueueWeeklyAnalyst } from "@/lib/analyst/schedule";
import { isoWeekLabel } from "@/lib/analyst/week";
import type { Db } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";

/** Queues the weekly analyst report for the current ISO week in `timeZone`. */
export function queueWeeklyAnalyst(
  db: Db,
  settings: { timeZone: string; tokenSet: boolean },
  now = new Date(),
): { id: number; created: boolean; week: string } {
  // Without a token the run could only fail in the worker.
  if (!settings.tokenSet) {
    throw new Error("HARBOUR_CLAUDE_OAUTH_TOKEN is not set: the weekly analyst needs it");
  }
  const week = isoWeekLabel(isoDateIn(settings.timeZone, now));
  return { ...enqueueWeeklyAnalyst(db, week, null, now), week };
}

async function main() {
  // Imported lazily so the unit test never loads the real database or config.
  const { getConfig } = await import("@/lib/config");
  const { getDb } = await import("@/lib/db/client");
  const config = getConfig();
  const job = queueWeeklyAnalyst(getDb(), {
    timeZone: config.HARBOUR_TIMEZONE,
    tokenSet: Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN),
  });
  console.log(`${job.created ? "queued" : "already queued"} #${job.id} weekly-analyst ${job.week}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
