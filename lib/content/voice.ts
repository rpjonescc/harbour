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

function sections(body: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const part of body.split(/^## /m).slice(1)) {
    const [heading = "", ...rest] = part.split("\n");
    found.set(heading.trim().toLowerCase(), rest.join("\n").trim());
  }
  return found;
}

function samplesProblem(samples: string[]): string | null {
  if (samples.length < 2 || samples.length > 4) return "Samples needs 2 to 4 passages.";
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
  const parsed = parseFile(text, voiceFrontmatter);
  if (!parsed.ok) return parsed;
  if (parsed.value.product !== productId) {
    return { ok: false, reason: "The voice profile is for another product." };
  }
  const found = sections(parsed.body);
  const howWeSound = found.get("how we sound") ?? "";
  if (howWeSound === "" || howWeSound.length > 1200) {
    return { ok: false, reason: "'How we sound' is missing or longer than 1,200 characters." };
  }
  const samples = (found.get("samples") ?? "")
    .split(SAMPLE_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
  const problem = samplesProblem(samples);
  if (problem) return { ok: false, reason: problem };
  const never = (found.get("never") ?? "")
    .split("\n")
    .flatMap((line) => (line.startsWith("- ") ? [line.slice(2).trim()] : []));
  return { ok: true, body: parsed.body, value: { ...parsed.value, howWeSound, never, samples } };
}
