// `pnpm retention:check`: what the next retention run would delete. Read-only (SELECTs on a
// read-only connection), counts only.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { count } from "drizzle-orm";
import { connectionOf, type Db, openReadonlyDb } from "@/lib/db/client";
import { agentRunEvents, jobs, observations } from "@/lib/db/schema";
import { describeProductPlan, MAX_PLANNED_SCANS, planRetention } from "@/lib/ops/retention";

const num = (n: number | null) => (n === null ? "not counted" : n.toLocaleString("en-US"));

function rows(db: Db, table: typeof observations | typeof jobs | typeof agentRunEvents) {
  try {
    return db.select({ n: count() }).from(table).get()?.n ?? null;
  } catch {
    return null; // a gap, never a zero
  }
}

/** The dry-run report for a database: one line per product, totals and row counts. */
export function retentionReport(db: Db, keep: number): string[] {
  const plan = planRetention(db, keep);
  const lines = [`keep ${keep} scans with observations per product`];
  for (const p of plan.products) {
    lines.push(
      p.pruneScanIds.length > 0
        ? describeProductPlan(p)
        : `${p.productId}: nothing to prune (${num(p.scans)} scans)`,
    );
  }
  const scans = plan.products.reduce((n, p) => n + p.pruneScanIds.length, 0);
  const counts = plan.products.map((p) => p.observations);
  const total = counts.includes(null) ? null : counts.reduce<number>((n, c) => n + (c ?? 0), 0);
  lines.push(`total: ${num(scans)} old scans, ${num(total)} observations to remove`);
  if (plan.truncated) {
    lines.push(`only the oldest ${MAX_PLANNED_SCANS} scans are planned per run; the rest follow`);
  }
  lines.push(
    `rows: observations ${num(rows(db, observations))}, jobs ${num(rows(db, jobs))}, agent_run_events ${num(rows(db, agentRunEvents))}`,
  );
  return lines;
}

/** Opens `path` read-only and reports; code 1 with a message when it is missing. */
export function checkRetention(path: string, keep: number): { code: 0 | 1; lines: string[] } {
  if (!existsSync(path)) return { code: 1, lines: [`Database not found: ${path}`] };
  const db = openReadonlyDb(path);
  try {
    return { code: 0, lines: retentionReport(db, keep) };
  } finally {
    connectionOf(db).close();
  }
}

async function main() {
  // Imported lazily so the unit test never loads the real config.
  const { getConfig } = await import("@/lib/config");
  const config = getConfig();
  const { code, lines } = checkRetention(
    config.HARBOUR_DB_PATH,
    config.HARBOUR_OBSERVATION_SCANS_KEPT,
  );
  for (const line of lines) (code === 0 ? console.log : console.error)(line);
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
