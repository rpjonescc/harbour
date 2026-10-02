import { Tag } from "@/components/ui/Tag";
import type { TabId } from "@/lib/content/read/view-types";

const WORDS: Record<TabId, string> = {
  ready: "Ready for you",
  "needs-you": "Needs you",
  ideas: "Idea",
  writing: "Being written",
  approved: "Approved",
  discarded: "Discarded",
};

/** The state in words (colour is never the only signal). */
export function StateTag({ tab }: { tab: TabId }) {
  return (
    <Tag tone={tab === "ready" ? "accent" : tab === "needs-you" ? "warn" : "neutral"}>
      {WORDS[tab]}
    </Tag>
  );
}
