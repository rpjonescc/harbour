import { z } from "zod";
import { type Parsed, parseFile } from "./files";
import { ideaIdSchema, platformSchema, productIdSchema } from "./ids";
import { contentSchemas, type PieceContent } from "./shapes";
import { IDEA_STATES, PIECE_STATES } from "./state";

export const FLAGS = [
  "health",
  "legal",
  "curriculum",
  "pricing",
  "testimonial",
  "comparative",
] as const;
export type Flag = (typeof FLAGS)[number];
export const GATE_NAMES = ["no-ai-slop", "humanizer", "facts", "platform"] as const;
export type Gate = (typeof GATE_NAMES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const sha = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/** A reference to something a claim or idea rests on. */
export const refSchema = z
  .string()
  .max(160)
  .regex(
    /^(?:product:[a-z0-9-]+|brain:[A-Za-z0-9_./-]+\.md|digest:\d{4}-\d{2}-\d{2}#t\d{1,2}|pillar:[a-z0-9-]+|source:p\d{1,2})$/,
  );

export const findingSchema = z.strictObject({
  pattern: text(100),
  quote: z.string().max(200),
  fix: z.string().max(200),
});
export type Finding = z.infer<typeof findingSchema>;

/** `trace` is a ref, or "none" for a claim with nothing behind it (which fails the facts gate). */
export const claimSchema = z.strictObject({
  text: text(300),
  trace: z.union([refSchema, z.literal("none")]),
  flag: z.enum(FLAGS).optional(),
});
export type Claim = z.infer<typeof claimSchema>;

const questions = z.array(text(200)).max(5);

export const gateEntrySchema = z.strictObject({
  gate: z.enum(GATE_NAMES),
  order: z.number().int().min(1).max(4),
  attempt: z.union([z.literal(1), z.literal(2)]),
  result: z.enum(["pass", "fail", "revised", "error"]),
  findings: z.array(findingSchema).max(20),
  questions,
  claims: z.array(claimSchema).max(30).optional(),
  instructions: z
    .strictObject({ name: text(40), source: text(300), sha256: z.string().regex(/^[0-9a-f]{64}$/) })
    .optional(),
  revisedAfter: z.array(z.enum(["no-ai-slop", "humanizer"])).optional(),
  jobId: z.number().int().min(0),
  at: text(40),
  textBefore: sha,
  textAfter: sha,
});
export type GateEntry = z.infer<typeof gateEntrySchema>;

export const summarySchema = z.enum(["pending", "pass", "revised", "fail", "error"]);

export const digestFrontmatter = z.strictObject({
  title: text(80),
  kind: z.literal("content-digest"),
  date: z.iso.date(),
  window: z.strictObject({ start: text(40), end: text(40) }),
  status: z.enum(["ok", "partial"]),
  themes: z
    .array(
      z.strictObject({
        id: z.string().regex(/^t\d{1,2}$/),
        productId: productIdSchema,
        text: text(160),
        kind: z.enum(["built", "fixed", "learned", "decided", "explored"]),
      }),
    )
    .max(24),
});

export const ideaFrontmatter = z.strictObject({
  title: text(90),
  kind: z.literal("content-idea"),
  productId: productIdSchema,
  state: z.enum(IDEA_STATES),
  pillar: text(60).nullable(),
  angle: text(240),
  audienceQuestion: text(160),
  why: text(240),
  sources: z.array(refSchema).min(1).max(8),
  needsYou: text(240).nullable().default(null),
  created: z.iso.date(),
  createdBy: text(40),
});
export type IdeaFront = z.infer<typeof ideaFrontmatter>;

export const sourceFrontmatter = z.strictObject({
  title: text(120),
  kind: z.literal("content-source"),
  ideaId: ideaIdSchema,
  productId: productIdSchema,
  paragraphs: z
    .array(z.string().regex(/^p\d{1,2}$/))
    .min(1)
    .max(40),
  facts: z.array(refSchema).max(40),
  // Open questions from the draft: carried into every platform piece.
  questions: z.array(text(200)).max(5).default([]),
  createdBy: text(40),
  skills: z
    .array(
      z.strictObject({
        name: text(40),
        source: text(300),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .max(4),
});
export type SourceFront = z.infer<typeof sourceFrontmatter>;

export const pieceFrontmatter = z.strictObject({
  title: text(120),
  kind: z.literal("content-piece"),
  ideaId: ideaIdSchema,
  productId: productIdSchema,
  platform: platformSchema,
  state: z.enum(PIECE_STATES),
  revision: z.number().int().min(1).max(100_000),
  gates: z.strictObject({
    slop: summarySchema,
    humanizer: summarySchema,
    facts: summarySchema,
    platform: summarySchema,
  }),
  flags: z.array(z.enum(FLAGS)).max(6),
  claims: z.array(claimSchema).max(20).default([]),
  // Questions the writer (or a gate) left for the owner; any open question keeps a piece out of Ready.
  questions: z.array(text(200)).max(5).default([]),
  needsYou: text(400).nullable(),
  edited: z.boolean(),
  approvedAt: z.iso.date().nullable(),
  exportPath: text(200).nullable().default(null),
  // The platform shape, validated against `platform` by parsePieceFile; null for a piece that
  // was not written ("This piece wasn't written").
  content: z.unknown(),
});
export type PieceFront = z.infer<typeof pieceFrontmatter>;

/** A piece file: its frontmatter, and its `content` checked against the platform's shape. */
export function parsePieceFile(
  text: string,
): Parsed<{ front: PieceFront; content: PieceContent | null }> {
  const parsed = parseFile(text, pieceFrontmatter);
  if (!parsed.ok) return parsed;
  const { value: front, body } = parsed;
  if (front.content === null) return { ok: true, value: { front, content: null }, body };
  const content = contentSchemas[front.platform].safeParse(front.content);
  if (!content.success)
    return { ok: false, reason: "The piece's content does not fit its platform." };
  return { ok: true, value: { front, content: content.data as PieceContent }, body };
}
