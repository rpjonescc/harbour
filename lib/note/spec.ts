import { lstatSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { retryPrompt } from "@/lib/agents/retry-prompt";
import type { AgentSpec, SpecContext } from "@/lib/agents/specs";
import { checkNote } from "@/lib/explain/voice/check";
import type { Facts } from "@/lib/explain/voice/facts";
import { readNoteBytes } from "./bounded-read";
import { noteDigest } from "./digest";
import { parseNoteFile } from "./file";
import { dailyNotePrompt, NOTE_PROMPT_VERSION } from "./prompt";
import { describeStamp, draftPath, notePath } from "./stamp";

/** A note is a few sentences: five minutes an attempt is generous (one retry at most). */
export const NOTE_TIMEOUT_MS = 5 * 60_000;

type Review = { reason: string } | { reason: null; digest: string };

/**
 * Checks the file at `path` and, when it is acceptable, returns the digest of the very bytes
 * that were checked. A missing, symlinked, oversized or invalid file is a reason the agent can
 * fix; any other read error is propagated.
 */
function inspectNote(root: string, path: string, facts: Facts): Review {
  const file = join(root, path);
  let bytes: Buffer | null;
  try {
    if (!lstatSync(file).isFile()) return { reason: "The note file must be a regular file." };
    bytes = readNoteBytes(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { reason: "The note file was not written." };
    }
    throw error;
  }
  if (bytes === null) return { reason: "The note file is too large." };
  const parsed = parseNoteFile(bytes.toString("utf8"));
  const reason = parsed.ok ? checkNote(parsed.note, facts) : parsed.reason;
  return reason === null ? { reason: null, digest: noteDigest(bytes) } : { reason };
}

/** The daily note: a draft, Write as the only tool, a short timeout and one reviewed retry. */
export function dailyNoteSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const stamp = params.stamp ?? "";
  const path = notePath(stamp); // throws on anything but a real stamp
  const draft = draftPath(stamp);
  if (!context.noteFacts) throw new Error("The daily note's facts are not available");
  const facts = context.noteFacts();
  // The digest of the bytes the last `check` accepted, or null when it rejected them.
  let checked: string | null = null;
  const prompt = dailyNotePrompt({ stamp, facts });
  return {
    kind: "daily-note",
    label: `Daily note: ${describeStamp(stamp)}`,
    prompt,
    allowed: { prefixes: [], exact: [path] },
    // The agent writes only the draft; the worker publishes it once the checker accepts it.
    targets: [draft],
    output: null,
    requiredFiles: [],
    requiredOutputs: [path],
    promptVersion: NOTE_PROMPT_VERSION,
    // Keep the note and the owner's first name out of the run record.
    quiet: true,
    // No web tools: the facts hold titles from crawled pages, and a web tool would be a way out.
    tools: ["Write"],
    timeoutMs: NOTE_TIMEOUT_MS,
    review: {
      check: (root) => {
        const review = inspectNote(root, draft, facts);
        checked = review.reason === null ? review.digest : null;
        return review.reason;
      },
      // Claude Code's Write will not overwrite a file it has not Read, and this run has no Read:
      // the rejected draft is removed so the retry writes a fresh one.
      reset: (root) => rmSync(join(root, draft), { force: true }),
      publish: (root) => {
        if (checked === null) throw new Error("The draft has not been checked and accepted");
        renameSync(join(root, draft), join(root, path));
        // What was moved must be what the checker accepted: refuse (and unpublish) otherwise.
        const bytes = readNoteBytes(join(root, path));
        if (bytes === null || noteDigest(bytes) !== checked) {
          rmSync(join(root, path), { force: true });
          throw new Error("The draft changed after it was checked");
        }
        return checked;
      },
      retryPrompt: (reason) => retryPrompt(prompt, reason),
    },
  };
}
