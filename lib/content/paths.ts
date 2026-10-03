import { z } from "zod";
import { isIsoDay, isoDaySchema } from "@/lib/format/iso-day";
import { ideaIdSchema, type Platform, platformSchema, productIdSchema } from "./ids";

const day = isoDaySchema;
const slug = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const jobId = z.number().int().min(0);

// Every path is built from parts parsed here, so model text can never become a path.
const ok = <T>(schema: z.ZodType<T>, value: unknown): T => schema.parse(value);
const ideaDir = (productId: string) => `content/ideas/${ok(productIdSchema, productId)}`;
const piecesDir = (ideaId: string) => `content/pieces/${ok(ideaIdSchema, ideaId)}`;
const pieceBase = (ideaId: string, platform: Platform) =>
  `${piecesDir(ideaId)}/${ok(platformSchema, platform)}`;

/** True only for a path `contentPaths.approved` could have built for `platform`: the one kind of path a discard may remove. */
export const isApprovedPath = (platform: Platform, path: string): boolean =>
  new RegExp(
    `^content/approved/${platform}/\\d{4}-\\d{2}-\\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\\.md$`,
  ).test(path) && path.length <= 120;

/** Whether a file name in the digest folder is a digest: a real day, then ".md". */
export const isDigestName = (name: string): boolean =>
  name.endsWith(".md") && isIsoDay(name.slice(0, -3));

/** The only place a content path is built; all of them are inside `content/` in the brain. */
export const contentPaths = {
  voice: (productId: string) => `content/voices/${ok(productIdSchema, productId)}.md`,
  neverMention: "content/never-mention.md",
  digestDir: "content/digests",
  digest: (d: string) => `content/digests/${ok(day, d)}.md`,
  ideaDir,
  idea: (productId: string, ideaId: string) =>
    `${ideaDir(productId)}/${ok(ideaIdSchema, ideaId)}.md`,
  piecesDir,
  source: (ideaId: string) => `${piecesDir(ideaId)}/source.md`,
  piece: (ideaId: string, platform: Platform) => `${pieceBase(ideaId, platform)}.md`,
  gates: (ideaId: string, platform: Platform) => `${pieceBase(ideaId, platform)}.gates.json`,
  approved: (platform: Platform, d: string, s: string) =>
    `content/approved/${ok(platformSchema, platform)}/${ok(day, d)}-${ok(slug, s)}.md`,
  work: (id: number) => `content/work/${ok(jobId, id)}.json`,
} as const;
