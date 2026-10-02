import { parse } from "yaml";
import { type Note, noteSchema, safeReason } from "@/lib/explain/voice/note";

/** A note is a few hundred characters; anything bigger is not one. */
export const MAX_NOTE_BYTES = 8 * 1024;

export type ParsedNote = { ok: true; note: Note } | { ok: false; reason: string };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const fail = (reason: string): ParsedNote => ({ ok: false, reason });

// Field names come from the agent, so only fixed text or sanitised tokens go into a reason.
function describe(issue: { code: string; path: PropertyKey[]; message: string }): string {
  if (issue.code === "unrecognized_keys") return "it has a field that is not part of the format";
  const field = issue.path.map(String).join(".") || "the note";
  return `${safeReason(field)}: ${issue.message}`;
}

/**
 * Parses the agent's note file: double-quoted YAML frontmatter (greeting, headline, mood, picks,
 * rest) and the body under it, validated with zod. Aliases are refused (expansion attacks).
 * Never throws: a bad file is a reason the agent can fix.
 */
export function parseNoteFile(text: string): ParsedNote {
  if (text.length > MAX_NOTE_BYTES) return fail("The note file is too large.");
  const match = FRONTMATTER.exec(text);
  if (!match) return fail("The note file has no frontmatter between two --- lines.");
  let data: unknown;
  try {
    data = parse(match[1] ?? "", { maxAliasCount: 0 });
  } catch {
    return fail("The frontmatter is not valid YAML. Put every value in double quotes.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail("The frontmatter must be a list of fields.");
  }
  const result = noteSchema.safeParse({ ...data, body: (match[2] ?? "").trim() });
  if (result.success) return { ok: true, note: result.data };
  return fail(`The note is not valid: ${result.error.issues.map(describe).join("; ")}.`);
}
