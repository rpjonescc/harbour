import { parse } from "yaml";
import { z } from "zod";

const schema = z
  .object({
    title: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    researched: z.iso.date().optional(),
    confidence: z.enum(["low", "medium", "high"]).optional(),
    review_by: z.iso.date().optional(),
    // Sources render as links, so only web URLs are accepted.
    sources: z.array(z.url({ protocol: /^https?$/ })).optional(),
  })
  .loose();

export type Frontmatter = {
  title?: string;
  tags?: string[];
  researched?: string;
  confidence?: "low" | "medium" | "high";
  review_by?: string;
  sources?: string[];
};

export type SplitDoc = { frontmatter: Frontmatter; body: string; frontmatterError: string | null };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Separates YAML frontmatter from the body. Problems are reported, never fatal. */
export function splitFrontmatter(text: string): SplitDoc {
  const match = FRONTMATTER.exec(text);
  if (!match) return { frontmatter: {}, body: text, frontmatterError: null };
  const body = text.slice(match[0].length);
  let raw: unknown;
  try {
    raw = parse(match[1] ?? "") ?? {};
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { frontmatter: {}, body, frontmatterError: `YAML: ${reason}` };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { frontmatter: {}, body, frontmatterError: z.prettifyError(result.error) };
  }
  const { title, tags, researched, confidence, review_by, sources } = result.data;
  return {
    frontmatter: Object.fromEntries(
      Object.entries({ title, tags, researched, confidence, review_by, sources }).filter(
        ([, value]) => value !== undefined,
      ),
    ) as Frontmatter,
    body,
    frontmatterError: null,
  };
}
