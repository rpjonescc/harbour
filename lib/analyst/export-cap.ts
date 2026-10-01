import type { ActionStatus } from "@/lib/actions/types";
import { byImpact } from "@/lib/scan/issues";
import type { ProductExport, WeeklyExport } from "./export";

/** The export is embedded in the agent's `-p` argument: well under Linux's 128 KiB limit. */
export const MAX_EXPORT_BYTES = 48 * 1024;

const EVIDENCE_CHARS = 120;
const RESOLVED_KEPT = 20;
const ACTIONS_KEPT = 40;
const ISSUES_KEPT = 5;
const STATUS_ORDER: Partial<Record<ActionStatus, number>> = {
  in_progress: 0,
  open: 1,
  suggested: 2,
  snoozed: 3,
};

type Step = { note: string; apply: (data: WeeklyExport) => WeeklyExport };

const eachProduct =
  (change: (p: ProductExport) => ProductExport) =>
  (data: WeeklyExport): WeeklyExport => ({ ...data, products: data.products.map(change) });

// Least useful to the analyst first; each step is recorded in `truncated` when it runs.
const STEPS: readonly Step[] = [
  {
    note: "Issue examples removed",
    apply: eachProduct((p) => ({ ...p, issues: p.issues.map((i) => ({ ...i, examples: [] })) })),
  },
  {
    note: `Sub-score evidence shortened to ${EVIDENCE_CHARS} characters`,
    apply: eachProduct((p) => ({
      ...p,
      subScores: p.subScores.map((s) => ({ ...s, evidence: s.evidence.slice(0, EVIDENCE_CHARS) })),
    })),
  },
  {
    note: "Score series cut to the latest scan per product",
    apply: eachProduct((p) => ({ ...p, scores: p.scores.slice(-1) })),
  },
  {
    note: `Resolved actions cut to the newest ${RESOLVED_KEPT}`,
    apply: (data) => ({ ...data, resolvedThisWeek: data.resolvedThisWeek.slice(0, RESOLVED_KEPT) }),
  },
  {
    note: `Actions cut to ${ACTIONS_KEPT} (highest impact first, then in progress, open, suggested, snoozed)`,
    apply: (data) => ({
      ...data,
      actions: [...data.actions]
        .sort(
          (a, b) =>
            byImpact(a, b) ||
            (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
            a.id - b.id,
        )
        .slice(0, ACTIONS_KEPT),
    }),
  },
  {
    note: "Proposed competitors removed (approved only)",
    apply: eachProduct((p) => ({
      ...p,
      competitors: p.competitors.filter((c) => c.status === "approved"),
    })),
  },
  {
    note: "Missing sub-scores removed",
    apply: eachProduct((p) => ({ ...p, subScores: p.subScores.filter((s) => s.status === "ok") })),
  },
  {
    note: `Issues cut to ${ISSUES_KEPT} per product (highest impact first)`,
    // A stable sort: equal impacts keep the scan's order.
    apply: eachProduct((p) => ({
      ...p,
      issues: [...p.issues].sort(byImpact).slice(0, ISSUES_KEPT),
    })),
  },
];

/** The notes `capExport` records, in the order it applies them. */
export const CAP_STEPS: readonly string[] = STEPS.map((s) => s.note);

const size = (text: string) => Buffer.byteLength(text, "utf8");

/** Serialises; while over the cap applies the next step, recording it in `truncated`. Same input → same output. */
export function capExport(data: WeeklyExport, maxBytes = MAX_EXPORT_BYTES): string {
  let current = data;
  let text = JSON.stringify(current);
  for (const step of STEPS) {
    if (size(text) <= maxBytes) return text;
    current = { ...step.apply(current), truncated: [...current.truncated, step.note] };
    text = JSON.stringify(current);
  }
  if (size(text) <= maxBytes) return text;
  throw new Error(`Weekly export is over ${maxBytes / 1024} KiB even after truncation`);
}
