import { ActivityFeed, WinsPanel } from "@/components/tower";
import { Example } from "./Example";
import { FAILED_TILE } from "./tower-example-data";
import { FEED_EXAMPLES, WINS_EXAMPLES } from "./tower-feed-example-data";

const failed = { ok: false as const, detail: FAILED_TILE.detail };

/** Fictional "What's happening" and "Wins this week" tiles, every state. */
export function TowerFeedExamples() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">
        Items under five minutes old carry a soft tint that fades once and say "new" in words. A
        working light breathes slowly. Under reduced motion both hold still.
      </p>
      {FEED_EXAMPLES.map(({ label, result }, i) => (
        <Example key={label} label={label}>
          <ActivityFeed result={result} anchor={`example-activity-${i}`} />
        </Example>
      ))}
      {WINS_EXAMPLES.map(({ label, result }, i) => (
        <Example key={label} label={label}>
          <WinsPanel result={result} anchor={`example-wins-${i}`} />
        </Example>
      ))}
      <Example label="What's happening · couldn't read the feed">
        <ActivityFeed result={failed} anchor="example-activity-failed" />
      </Example>
    </div>
  );
}
