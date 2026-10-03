import { count, type PageVerdict, sentences } from "./page-verdict";
import type { TermLine } from "./term-line";

/** The Second Brain's line under its title. */
export const BRAIN_INTRO: TermLine = [
  "Your private notes, which you and Claude's ",
  { term: "agent", text: "agents" },
  " both read and write.",
];

/** What the Second Brain verdict reads: the index and whether the notes are saved. */
export type BrainFacts = {
  notes: number;
  /** Notes never opened, or changed since they were last opened. */
  fresh: number;
  /** When the newest note changed, already in words ("4 min ago"); null when there are none. */
  lastChanged: string | null;
  /** Note files changed but not saved yet; null when Harbour can't run git in the folder. */
  unsaved: number | null;
  /** Saved changes not yet on GitHub; null when Harbour couldn't count them. */
  unpushed: number | null;
  /** Git ran and failed, so Harbour can't say whether the notes are saved. */
  syncFailed: boolean;
  /** An interrupted run is being recovered (or can't be checked), so saving is paused. */
  recovering: boolean;
};

/** Whether the notes are saved, in one sentence, and the tone it gives the verdict. */
function saved(f: BrainFacts): PageVerdict | null {
  if (f.recovering) {
    return { tone: "watch", text: "Saving is paused while an interrupted run is put right." };
  }
  if (f.syncFailed) {
    return { tone: "watch", text: "Harbour couldn't check whether your notes are saved." };
  }
  if (f.unsaved === null) return null;
  if (f.unsaved === 0) {
    // Said once, here: the Second Brain hides its own "Saved · synced" line when all is clear.
    const text = f.unpushed === 0 ? "Everything is saved and synced." : "Everything is saved.";
    return { tone: "ok", text };
  }
  const files = count(f.unsaved, "change");
  return { tone: "ok", text: `${files} will be saved automatically soon.` };
}

/** The Second Brain's verdict: how many notes, when one last changed, and whether all is saved. */
export function brainVerdict(f: BrainFacts): PageVerdict {
  if (f.notes === 0) {
    return {
      tone: "unknown",
      text: "No notes yet. Add Markdown files to your Second Brain folder, or run research on the Agents page.",
    };
  }
  const changed = f.lastChanged === null ? "" : `, the newest changed ${f.lastChanged}`;
  const fresh = f.fresh > 0 ? `${f.fresh} ${f.fresh === 1 ? "is" : "are"} new to you.` : null;
  const save = saved(f);
  return {
    tone: save?.tone ?? "ok",
    text: sentences(`${count(f.notes, "note")}${changed}.`, save?.text ?? null, fresh),
  };
}
