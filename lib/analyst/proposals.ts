import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { docsSchema, httpUrl, MAX_EVIDENCE_TEXT } from "@/lib/actions/evidence";
import { insertAction, normaliseTitle } from "@/lib/actions/store";
import type { ActionStatus } from "@/lib/actions/types";
import type { Db } from "@/lib/db/client";
import { actions, jobs } from "@/lib/db/schema";

const MAX_ACTIONS = 10;
const MAX_EVIDENCE = 10;
const text = (max: number) => z.string().trim().min(1).max(max);

const proposedAction = z
  .object({
    productId: z.string().min(1).max(80),
    area: z.enum(["SEO", "GEO", "AEO"]),
    title: text(120),
    why: text(800),
    fix: text(800),
    check: text(400),
    impact: z.enum(["high", "medium", "low"]),
    effort: z.enum(["small", "medium", "large"]),
    evidence: z
      .array(z.object({ url: httpUrl.optional(), note: text(MAX_EVIDENCE_TEXT) }).strict())
      .min(1, "every action cites at least one piece of evidence")
      .max(MAX_EVIDENCE),
    docs: docsSchema,
  })
  .strict();

/** The analyst's `reports/weekly/<week>.proposals.json`; products are checked by the parser. */
export const weeklyProposalsSchema = z
  .object({ actions: z.array(proposedAction).max(MAX_ACTIONS) })
  .strict();

export type WeeklyProposals = z.infer<typeof weeklyProposalsSchema>;

/** Parses a weekly proposals file against the configured products; throws a readable reason. */
export function parseWeeklyProposals(text: string, productIds: readonly string[]): WeeklyProposals {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\ufeff/, ""));
  } catch {
    throw new Error("The weekly proposals file is not valid JSON");
  }
  const schema = weeklyProposalsSchema.superRefine((data, ctx) => {
    data.actions.forEach((action, i) => {
      if (productIds.includes(action.productId)) return;
      ctx.addIssue({
        code: "custom",
        path: ["actions", i, "productId"],
        message: `Unknown product: ${action.productId}`,
      });
    });
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`The weekly proposals file is invalid:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// The owner's rejections (dismissed) are not suggested again; a done action may come back.
const KNOWN: ActionStatus[] = ["suggested", "open", "in_progress", "snoozed", "dismissed"];

function isKnown(tx: Db, productId: string, titleKey: string): boolean {
  const row = tx
    .select({ id: actions.id })
    .from(actions)
    .where(
      and(
        eq(actions.productId, productId),
        eq(actions.titleKey, titleKey),
        inArray(actions.status, KNOWN),
      ),
    )
    .get();
  return row !== undefined;
}

/**
 * Inserts the proposals as `suggested` agent actions in one transaction, skipping titles the
 * product already has (any source) or the file repeats.
 */
export function importWeeklyActions(
  db: Db,
  data: WeeklyProposals,
  jobId: number,
  now: Date,
): { added: number; skipped: number } {
  const job = db.select({ params: jobs.params }).from(jobs).where(eq(jobs.id, jobId)).get();
  const note = `Suggested by the weekly report ${job?.params.week ?? ""}`.trim();
  return db.transaction(
    (tx) => {
      const seen = new Set<string>();
      let added = 0;
      for (const { evidence, ...a } of data.actions) {
        const titleKey = normaliseTitle(a.title);
        const key = JSON.stringify([a.productId, titleKey]);
        if (seen.has(key) || isKnown(tx, a.productId, titleKey)) continue;
        seen.add(key);
        const items = evidence.map((e) => ({ text: e.note, url: e.url ?? null }));
        insertAction(
          tx,
          {
            ...a,
            evidence: { items, total: items.length },
            source: "agent",
            ruleKey: null,
            sourceJobId: jobId,
            status: "suggested",
            snoozedUntil: null,
            issuePresent: null,
          },
          "agent",
          note,
          now,
        );
        added++;
      }
      return { added, skipped: data.actions.length - added };
    },
    { behavior: "immediate" },
  );
}
