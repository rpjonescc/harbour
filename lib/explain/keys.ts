import type { KeyRow } from "@/lib/settings/key-status";
import { CLAUDE_CONNECT_STEPS, CLAUDE_PURPOSE } from "./claude";
import { SCREENPIPE_CONNECT_STEPS, SCREENPIPE_PURPOSE } from "./screenpipe";
import { sourceExplanation } from "./sources";

export type KeyPhrase = {
  text: string;
  tone: "accent" | "warn" | "neutral";
  note: string | null;
  connected: boolean;
};

/** Where a key stands in plain words: Connected, Not connected yet, or Not available yet. */
export function keyPhrase(row: Pick<KeyRow, "status" | "inUse">): KeyPhrase {
  if (!row.inUse)
    return { text: "Not available yet", tone: "neutral", note: null, connected: false };
  if (row.status === "present") {
    return { text: "Connected", tone: "accent", note: null, connected: true };
  }
  if (row.status === "file-not-found") {
    return {
      text: "Not connected yet",
      tone: "warn",
      note: "Harbour can't find the credentials file you set up. Check the steps below.",
      connected: false,
    };
  }
  return { text: "Not connected yet", tone: "neutral", note: null, connected: false };
}

/** What the key gives Harbour, in one sentence. */
export function keyPurpose(id: string): string {
  if (id === "claude") return CLAUDE_PURPOSE;
  if (id === "screenpipe") return SCREENPIPE_PURPOSE;
  return sourceExplanation(id).gives;
}

/** How to connect it; the setting names live only in these steps. */
export function keySteps(id: string): readonly string[] {
  if (id === "claude") return CLAUDE_CONNECT_STEPS;
  if (id === "screenpipe") return SCREENPIPE_CONNECT_STEPS;
  return sourceExplanation(id).connect;
}
