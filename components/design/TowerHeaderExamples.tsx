import { UpdatesPaused } from "@/components/tower";
import { type HeadlineInput, towerHeadlineParts } from "@/lib/explain/tower";
import { WORKER_SENTENCE } from "@/lib/explain/tower-lights";
import { Example } from "./Example";

const HEADLINES: { label: string; input: HeadlineInput }[] = [
  { label: "Headline · all calm", input: { worst: null, needsCount: 0 } },
  { label: "Headline · two things need you", input: { worst: null, needsCount: 2 } },
  {
    label: "Headline · a red light leads",
    input: { worst: { id: "worker", sentence: WORKER_SENTENCE.stopped }, needsCount: 3 },
  },
  { label: "Headline · lights worth a look", input: { worst: null, needsCount: 1, looks: 2 } },
  {
    label: "Headline · systems couldn't be read",
    input: { worst: null, needsCount: null, systemsRead: false },
  },
];

/**
 * The tower's header states: the headline the h1 carries (here as text, since /design has its own
 * h1) and the line shown once auto-refresh stops.
 */
export function TowerHeaderExamples() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">
        On Today the headline is the page's only h1. Its second sentence is announced politely when
        a refresh changes it. The page refreshes every minute while visible, every 15 seconds while
        work runs, never while hidden, and pauses after about two hours.
      </p>
      {HEADLINES.map(({ label, input }) => {
        const { lead, subline } = towerHeadlineParts(input);
        return (
          <Example key={label} label={label}>
            <p className="font-serif text-3xl">
              {lead} <span>{subline}</span>
            </p>
          </Example>
        );
      })}
      <Example label="Header · updates paused after two hours">
        <UpdatesPaused />
      </Example>
    </div>
  );
}
