import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { proposals } from "@/lib/db/schema";

const why = z.string().trim().min(1).max(400);
const keyword = z.object({
  term: z.string().trim().min(1).max(120),
  intent: z.enum(["informational", "commercial", "transactional", "navigational", "local"]),
  location: z.string().trim().min(1).max(80).optional(),
  why,
});
const question = z.object({ text: z.string().trim().min(1).max(300), why });
const competitorUrl = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .refine((v) => {
    const u = new URL(v);
    return !u.username && !u.password;
  }, "URL must not contain credentials");
const competitor = z.object({
  name: z.string().trim().min(1).max(120),
  url: competitorUrl,
  why,
});

// Single-line plain text: control and invisible format characters (newlines, zero-width, bidi
// overrides) are refused so a pillar can't smuggle structure into a later prompt or label.
const plainLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v), "must be plain text on one line");
const pillar = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(40),
  name: plainLine(60),
  description: plainLine(300),
  why,
});
/** Most pillars a product may have approved at once: the owner rejects one to make room. */
export const MAX_APPROVED_PILLARS = 6;
export type Pillar = { key: string; name: string; description: string };

export const proposalsSchema = z.object({
  keywords: z.array(keyword).max(60),
  questions: z.array(question).max(30),
  competitors: z.array(competitor).max(10),
  pillars: z.array(pillar).max(5).default([]),
});

export type Proposals = z.infer<typeof proposalsSchema>;
export type ProposalType = "keyword" | "question" | "competitor" | "pillar";
export type ProposalRow = typeof proposals.$inferSelect;

const VALUE_SCHEMAS = {
  keyword: keyword.omit({ why: true }),
  question: question.omit({ why: true }),
  competitor: competitor.omit({ why: true }),
  pillar: pillar.omit({ why: true }),
} as const;

/** "✖ msg\n  → at field" blocks from z.prettifyError become "field: msg" lines. */
function readableIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("\n");
}

function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Normalised identity used to dedupe. Keys are JSON arrays so separators in
 * the data can't collide. Competitors are keyed by lower-case host without a
 * leading "www." plus the normalised (case-insensitive) path without trailing
 * slashes, so example.com/a and example.com/b stay distinct.
 */
function keyFor(type: ProposalType, value: Record<string, string | undefined>): string {
  if (type === "keyword")
    return JSON.stringify(["kw", norm(value.term ?? ""), norm(value.location ?? "")]);
  if (type === "question") return JSON.stringify(["q", norm(value.text ?? "")]);
  if (type === "pillar") return JSON.stringify(["p", norm(value.key ?? "")]);
  if (URL.canParse(value.url ?? "")) {
    const u = new URL(value.url ?? "");
    return JSON.stringify([
      "c",
      u.hostname.toLowerCase().replace(/^www\./, ""),
      norm(u.pathname).replace(/\/+$/, ""),
    ]);
  }
  return JSON.stringify(["c", norm(value.name ?? ""), ""]);
}

/** Parses an agent's proposals.json; throws with a readable reason. */
export function parseProposals(text: string): Proposals {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("proposals.json is not valid JSON");
  }
  const result = proposalsSchema.safeParse(raw);
  if (!result.success)
    throw new Error(`proposals.json is invalid:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** Inserts new items as proposed; existing items (any status) are left untouched. */
export function importProposals(
  db: Db,
  productId: string,
  data: Proposals,
  jobId: number | null,
  now = new Date(),
) {
  const rows: { type: ProposalType; value: Record<string, string>; why: string }[] = [
    ...data.keywords.map(({ why: w, ...value }) => ({
      type: "keyword" as const,
      value: value as Record<string, string>,
      why: w,
    })),
    ...data.questions.map(({ why: w, ...value }) => ({ type: "question" as const, value, why: w })),
    ...data.competitors.map(({ why: w, ...value }) => ({
      type: "competitor" as const,
      value,
      why: w,
    })),
    ...data.pillars.map(({ why: w, ...value }) => ({ type: "pillar" as const, value, why: w })),
  ];
  let added = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      const inserted = tx
        .insert(proposals)
        .values({
          productId,
          type: row.type,
          value: row.value,
          key: keyFor(row.type, row.value),
          why: row.why,
          status: "proposed",
          sourceJobId: jobId,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: proposals.id })
        .all();
      added += inserted.length;
    }
  });
  return { added, skipped: rows.length - added };
}

export function listProposals(db: Db, productId: string): Record<ProposalType, ProposalRow[]> {
  const all = db
    .select()
    .from(proposals)
    .where(eq(proposals.productId, productId))
    .orderBy(asc(proposals.id))
    .all();
  return {
    keyword: all.filter((p) => p.type === "keyword"),
    question: all.filter((p) => p.type === "question"),
    competitor: all.filter((p) => p.type === "competitor"),
    pillar: all.filter((p) => p.type === "pillar"),
  };
}

/** The pillars the owner approved, oldest first: what ideas are shaped by. */
export function approvedPillars(db: Db, productId: string): Pillar[] {
  return db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.productId, productId),
        eq(proposals.type, "pillar"),
        eq(proposals.status, "approved"),
      ),
    )
    .orderBy(asc(proposals.id))
    .all()
    .map(({ value }) => ({
      key: value.key ?? "",
      name: value.name ?? "",
      description: value.description ?? "",
    }));
}

/** Whether approving would take a product past six approved pillars (the owner must reject one first). */
export function pillarLimitReached(
  db: Db,
  productId: string,
  action: { action: string; type?: string; proposalId?: number },
): boolean {
  const approved = approvedPillars(db, productId).length;
  if (action.action === "approve-all" && action.type === "pillar") {
    const proposed = listProposals(db, productId).pillar.filter(
      (p) => p.status === "proposed",
    ).length;
    return approved + proposed > MAX_APPROVED_PILLARS;
  }
  if (action.action !== "approve" || action.proposalId === undefined) return false;
  const row = listProposals(db, productId).pillar.find((p) => p.id === action.proposalId);
  return row?.status === "proposed" && approved >= MAX_APPROVED_PILLARS;
}

export function decideProposal(
  db: Db,
  productId: string,
  id: number,
  status: "approved" | "rejected",
  now = new Date(),
): boolean {
  return (
    db
      .update(proposals)
      .set({ status, decidedAt: now })
      .where(and(eq(proposals.id, id), eq(proposals.productId, productId)))
      .returning({ id: proposals.id })
      .all().length === 1
  );
}

export function editProposal(db: Db, productId: string, id: number, value: Record<string, string>) {
  const row = db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.productId, productId)))
    .get();
  if (!row) return { ok: false as const, error: "not_found" };
  if (row.status === "rejected")
    return { ok: false as const, error: "rejected items can't be edited" };
  const parsed = VALUE_SCHEMAS[row.type].safeParse(value);
  if (!parsed.success) return { ok: false as const, error: readableIssues(parsed.error) };
  const clean = parsed.data as Record<string, string>;
  try {
    db.update(proposals)
      .set({ value: clean, key: keyFor(row.type, clean), edited: true })
      .where(eq(proposals.id, id))
      .run();
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { ok: false as const, error: "An item with that value already exists" };
    }
    throw error;
  }
  return { ok: true as const };
}

export function approveAllProposed(
  db: Db,
  productId: string,
  type: ProposalType,
  now = new Date(),
): number {
  return db
    .update(proposals)
    .set({ status: "approved", decidedAt: now })
    .where(
      and(
        eq(proposals.productId, productId),
        eq(proposals.type, type),
        eq(proposals.status, "proposed"),
      ),
    )
    .returning({ id: proposals.id })
    .all().length;
}
