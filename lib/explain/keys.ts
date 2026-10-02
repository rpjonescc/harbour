import type { KeyRow } from "@/lib/settings/key-status";
import { CLAUDE_CONNECT_STEPS, CLAUDE_PURPOSE } from "./claude";
import { sourceExplanation } from "./sources";

export type KeyPhrase = { text: string; tone: "accent" | "warn" | "neutral"; note: string | null };

/** Where a key stands in plain words: Connected, Not connected yet, or Not available yet. */
export function keyPhrase(row: Pick<KeyRow, "status" | "inUse">): KeyPhrase {
  if (!row.inUse) return { text: "Not available yet", tone: "neutral", note: null };
  if (row.status === "present") return { text: "Connected", tone: "accent", note: null };
  if (row.status === "file-not-found") {
    return {
      text: "Not connected yet",
      tone: "warn",
      note: "Harbour can't find the credentials file you set up. Check the steps below.",
    };
  }
  return { text: "Not connected yet", tone: "neutral", note: null };
}

/** What the key gives Harbour, in one sentence. */
export function keyPurpose(id: string): string {
  return id === "claude" ? CLAUDE_PURPOSE : sourceExplanation(id).gives;
}

/** How to connect it; the setting names live only in these steps. */
export function keySteps(id: string): readonly string[] {
  return id === "claude" ? CLAUDE_CONNECT_STEPS : sourceExplanation(id).connect;
}
