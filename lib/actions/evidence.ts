import { z } from "zod";
import type { Evidence } from "./types";

export const MAX_EVIDENCE_ITEMS = 20;
export const MAX_EVIDENCE_TEXT = 300;
export const MAX_DOCS = 5;

/** An http(s) URL of at most 2048 characters, without credentials. */
export const httpUrl = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .refine((v) => {
    // Refinements run even when the URL check failed: never let a parse error throw.
    const u = URL.parse(v);
    return u !== null && !u.username && !u.password;
  }, "URL must not contain credentials");

export const evidenceSchema = z
  .object({
    items: z
      .array(
        z.object({ text: z.string().max(MAX_EVIDENCE_TEXT), url: httpUrl.nullable() }).strict(),
      )
      .max(MAX_EVIDENCE_ITEMS),
    total: z.number().int().nonnegative(),
  })
  .strict()
  .refine((e) => e.total >= e.items.length, "total counts every item");

/** Brain paths: relative `.md`, no `..` segment, no leading slash. */
const docPath = z
  .string()
  .max(200)
  .regex(/^[^/].*\.md$/)
  .refine((p) => !p.split("/").includes(".."), "no parent segments");

export const docsSchema = z.array(docPath).max(MAX_DOCS);

/** Reads stored evidence; anything that fails validation is an empty, flagged gap. */
export function readEvidence(value: unknown): { evidence: Evidence; invalid: boolean } {
  const parsed = evidenceSchema.safeParse(value);
  if (parsed.success) return { evidence: parsed.data, invalid: false };
  return { evidence: { items: [], total: 0 }, invalid: true };
}

/** Reads stored related-doc paths; anything that fails validation is an empty, flagged gap. */
export function readDocs(value: unknown): { docs: string[]; invalid: boolean } {
  const parsed = docsSchema.safeParse(value);
  if (parsed.success) return { docs: parsed.data, invalid: false };
  return { docs: [], invalid: true };
}
