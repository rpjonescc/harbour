import { lstatSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AgentSpec, SpecContext } from "@/lib/agents/specs";
import { checkNote } from "@/lib/explain/voice/check";
import type { Facts } from "@/lib/explain/voice/facts";
import { MAX_NOTE_BYTES, parseNoteFile } from "./file";
import { dailyNotePrompt, NOTE_PROMPT_VERSION, retryPrompt } from "./prompt";
import { describeStamp, draftPath, notePath } from "./stamp";

/** A note is a few sentences: five minutes an attempt is generous (one retry at most). */
export const NOTE_TIMEOUT_MS = 5 * 60_000;

/**
 * Why the file at `path` is not an acceptable note, or null when it is. A missing, symlinked,
 * oversized or invalid file is a reason the agent can fix; any other read error is propagated.
 */
export function reviewNote(root: string, path: string, facts: Facts): string | null {
  const file = join(root, path);
  let text: string;
  try {
    const stats = lstatSync(file); // a symlink is never followed
    if (!stats.isFile()) return "The note file must be a regular file.";
    if (stats.size > MAX_NOTE_BYTES) return "The note file is too large.";
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "The note file was not written.";
    throw error;
  }
  const parsed = parseNoteFile(text);
  return parsed.ok ? checkNote(parsed.note, facts) : parsed.reason;
}

/** The daily note: a draft, Write as the only tool, a short timeout and one reviewed retry. */
export function dailyNoteSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const stamp = params.stamp ?? "";
  const path = notePath(stamp); // throws on anything but a real stamp
  const draft = draftPath(stamp);
  if (!context.noteFacts) throw new Error("The daily note's facts are not available");
  const facts = context.noteFacts();
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
      check: (root) => reviewNote(root, draft, facts),
      // Claude Code's Write will not overwrite a file it has not Read, and this run has no Read:
      // the rejected draft is removed so the retry writes a fresh one.
      reset: (root) => rmSync(join(root, draft), { force: true }),
      publish: (root) => renameSync(join(root, draft), join(root, path)),
      retryPrompt: (reason) => retryPrompt(prompt, reason),
    },
  };
}
