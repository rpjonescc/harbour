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
const competitor = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.url({ protocol: /^https?$/ }),
  why,
});

export const proposalsSchema = z.object({
  keywords: z.array(keyword).max(60),
  questions: z.array(question).max(30),
  competitors: z.array(competitor).max(10),
});

export type Proposals = z.infer<typeof proposalsSchema>;
export type ProposalType = "keyword" | "question" | "competitor";
export type ProposalRow = typeof proposals.$inferSelect;

const VALUE_SCHEMAS = {
  keyword: keyword.omit({ why: true }),
  question: question.omit({ why: true }),
  competitor: competitor.omit({ why: true }),
} as const;

function keyFor(type: ProposalType, value: Record<string, string | undefined>): string {
  if (type === "keyword") return `${value.term ?? ""}|${value.location ?? ""}`.toLowerCase().trim();
  if (type === "question") return (value.text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return URL.canParse(value.url ?? "")
    ? new URL(value.url ?? "").hostname.replace(/^www\./, "")
    : (value.name ?? "").toLowerCase();
}

/** Parses an agent's proposals.json; throws with a readable reason. */
export function parseProposals(text: string): Proposals {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
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
  };
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

export function editProposal(
  db: Db,
  productId: string,
  id: number,
  value: Record<string, string>,
  now = new Date(),
) {
  const row = db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.productId, productId)))
    .get();
  if (!row) return { ok: false as const, error: "not_found" };
  const parsed = VALUE_SCHEMAS[row.type].safeParse(value);
  if (!parsed.success) return { ok: false as const, error: z.prettifyError(parsed.error) };
  const clean = parsed.data as Record<string, string>;
  try {
    db.update(proposals)
      .set({ value: clean, key: keyFor(row.type, clean), edited: true, decidedAt: now })
      .where(eq(proposals.id, id))
      .run();
  } catch {
    return { ok: false as const, error: "An item with that value already exists" };
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
