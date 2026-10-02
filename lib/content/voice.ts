import { z } from "zod";
import { type Parsed, parseFile } from "./files";
import { productIdSchema } from "./ids";
import { FLAGS } from "./schema";
import { wordCount } from "./shapes";

const list = z.array(z.string().trim().min(1).max(40)).max(40).default([]);

const voiceFrontmatter = z.strictObject({
  product: productIdSchema,
  audience: z.string().trim().min(10).max(300),
  person: z.enum(["we", "I", "product-name"]),
  spelling: z.enum(["en-GB", "en-US", "en-AU"]),
  readingLevel: z.enum(["plain", "technical"]),
  emoji: z.enum(["none", "sparing"]),
  exclamations: z.enum(["none", "rare"]),
  wordsWeUse: list,
  wordsWeAvoid: list,
  topicsToAvoid: list,
  reviewAlways: z.array(z.enum(FLAGS)).default([]),
  callsToAction: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  linkInBio: z.boolean().default(false),
});

export type VoiceProfile = z.infer<typeof voiceFrontmatter> & {
  howWeSound: string;
  never: string[];
  samples: string[];
};

const MAX_PROFILE_CHARS = 32_000;
const SAMPLE_SEPARATOR = /\n\s*\*\s\*\s\*\s*\n/;

const SECTION_ORDER = ["how we sound", "never", "samples"];
const MAX_NEVER = 20;
const MAX_NEVER_CHARS = 200;
const MAX_SAMPLE_CHARS = 2000;

/** The three sections in order, or a reason: unknown, duplicate, missing or misplaced headings are refused. */
function sections(body: string): Parsed<Record<string, string>> {
  const [preamble = "", ...parts] = body.split(/^## /m);
  if (preamble.trim() !== "")
    return { ok: false, reason: "There is text before the first '## ' heading." };
  const headings = parts.map((part) => (part.split("\n")[0] ?? "").trim().toLowerCase());
  if (headings.join("|") !== SECTION_ORDER.join("|")) {
    return {
      ok: false,
      reason: "The body needs exactly three sections, in this order: How we sound, Never, Samples.",
    };
  }
  const found: Record<string, string> = {};
  parts.forEach((part, index) => {
    found[SECTION_ORDER[index] ?? ""] = part
      .split("\n")
      .slice(1)
      .join("\n")
      .replace(/^(?:[ \t]*\n)+/, "") // keep the first line's indent: an indented bullet is refused
      .trimEnd();
  });
  return { ok: true, value: found, body };
}

/** Bullets of `- text`; any other non-empty line (other markers, indents, wrapped lines) is refused. */
function neverList(text: string): string[] | null {
  const items: string[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    if (!line.startsWith("- ") || line.slice(2).trim() === "") return null;
    items.push(line.slice(2).trim());
  }
  const tooLong = items.some((item) => item.length > MAX_NEVER_CHARS);
  return items.length > MAX_NEVER || tooLong ? null : items;
}

function samplesProblem(samples: string[]): string | null {
  if (samples.length < 2 || samples.length > 4) return "Samples needs 2 to 4 passages.";
  if (samples.some((s) => s.length > MAX_SAMPLE_CHARS))
    return "A sample is longer than 2,000 characters.";
  const bad = samples.findIndex((s) => wordCount(s) < 50 || wordCount(s) > 150);
  return bad === -1 ? null : `Sample ${bad + 1} must be 50 to 150 words.`;
}

/** Parses an owner-written voice profile for `productId`; a reason when it is not usable. */
export function parseVoiceProfile(text: string, productId: string): Parsed<VoiceProfile> {
  // Types are erased at the file boundary; a non-string or oversize profile is a reason, not a crash.
  if (typeof text !== "string") return { ok: false, reason: "The voice profile is not text." };
  if (text.length > MAX_PROFILE_CHARS) {
    return { ok: false, reason: "The voice profile is longer than 32,000 characters." };
  }
  const parsed = parseFile(text.replace(/\r\n?/g, "\n"), voiceFrontmatter);
  if (!parsed.ok) return parsed;
  if (parsed.value.product !== productId) {
    return { ok: false, reason: "The voice profile is for another product." };
  }
  const found = sections(parsed.body);
  if (!found.ok) return found;
  const howWeSound = (found.value["how we sound"] ?? "").trim();
  if (howWeSound === "" || howWeSound.length > 1200) {
    return { ok: false, reason: "'How we sound' is missing or longer than 1,200 characters." };
  }
  const samples = (found.value.samples ?? "")
    .split(SAMPLE_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
  const problem = samplesProblem(samples);
  if (problem) return { ok: false, reason: problem };
  const never = neverList(found.value.never ?? "");
  if (!never) {
    return {
      ok: false,
      reason: `'Never' must be at most ${MAX_NEVER} bullets starting '- ', each up to ${MAX_NEVER_CHARS} characters.`,
    };
  }
  return { ok: true, body: parsed.body, value: { ...parsed.value, howWeSound, never, samples } };
}
