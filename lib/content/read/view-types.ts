import type { Platform } from "@/lib/content/ids";
import type { Claim, Flag, GateEntry } from "@/lib/content/schema";
import type { VoiceState } from "./voice";

export const TABS = [
  { id: "ready", label: "Ready for you" },
  { id: "needs-you", label: "Needs you" },
  { id: "ideas", label: "Ideas" },
  { id: "writing", label: "Being written" },
  { id: "approved", label: "Approved" },
  { id: "discarded", label: "Discarded" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

export type PieceView = {
  /** `<ideaId>.<platform>` */
  id: string;
  platform: Platform;
  platformName: string;
  tab: TabId;
  title: string;
  /** The piece as the reader sees it (plain text; empty for a stub). */
  text: string;
  /** What each Copy button copies. */
  copy: { label: string; text: string }[];
  /** The text the owner edits. */
  editText: string;
  empty: boolean;
  needsYou: string | null;
  /** True when "Needs you" is derived from a failed step: the button is Try again. */
  retry: boolean;
  flags: Flag[];
  flagLines: string[];
  revision: number;
  edited: boolean;
  state: string;
  /** A decision for this piece is queued or running. */
  saving: boolean;
  /** Why the newest decision on this piece (asked at its current revision) saved nothing. */
  decisionError: string | null;
  gates: GateEntry[];
  claims: Claim[];
  /** The piece's brain path, for the Second Brain link. */
  file: string;
};

export type IdeaView = {
  id: string;
  productId: string;
  productName: string;
  title: string;
  why: string;
  pillar: string | null;
  angle: string;
  audienceQuestion: string;
  sources: string[];
  created: string;
  /** Where the idea card itself sits; null when only its pieces show. */
  tab: TabId | null;
  note: string | null;
  retry: boolean;
  saving: boolean;
  /** Why the newest decision on this idea saved nothing. */
  decisionError: string | null;
  pieces: PieceView[];
  rollup: string;
};

export type ContentView = {
  tabs: { id: TabId; label: string; count: number }[];
  defaultTab: TabId;
  ideas: IdeaView[];
  voice: { productId: string; name: string; state: VoiceState["state"]; reason?: string }[];
  digest: { gap: boolean };
  unreadable: string[];
  /** Which cap cut the list short (200 ideas or 600 pieces), if one did. */
  capped: "ideas" | "pieces" | null;
  /** A folder could not be read at all; the page says so plainly. */
  folderError: boolean;
  tokenSet: boolean;
};
