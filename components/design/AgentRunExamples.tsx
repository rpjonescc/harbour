import { BrainSyncBanner } from "@/components/agents/BrainSyncBanner";
import { RecoveryBanner } from "@/components/agents/RecoveryBanner";
import { RunActivity } from "@/components/agents/RunActivity";
import { RunPanel } from "@/components/agents/RunPanel";
import type { RunEvent, RunJob } from "@/components/agents/run-types";
import { Example } from "./Example";

const PRODUCTS = [{ id: "acme-docs", name: "Acme Docs" }];

const FINISHED: RunJob = {
  id: 9101,
  kind: "discovery",
  status: "ok",
  error: null,
  label: "Find ideas: Acme Docs",
  createdAt: "2026-10-04T19:00:00Z",
  startedAt: "2026-10-04T19:00:05Z",
  finishedAt: "2026-10-04T19:03:20Z",
};

const EVENTS: RunEvent[] = [
  { id: 1, at: "2026-10-04T19:00:06Z", kind: "status", text: "Started" },
  { id: 2, at: "2026-10-04T19:02:00Z", kind: "text", text: "Found 12 ideas to look at." },
  { id: 3, at: "2026-10-04T19:03:20Z", kind: "status", text: "Finished" },
];

/** Fictional Agents run states: the run buttons, a finished and a failed run, sync and recovery. */
export function AgentRunExamples() {
  return (
    <div className="flex flex-col gap-6">
      <Example label="Run panel, Claude connected">
        <RunPanel products={PRODUCTS} tokenSet />
      </Example>
      <Example label="Run panel, Claude not connected">
        <RunPanel products={PRODUCTS} tokenSet={false} />
      </Example>
      <Example label="Run activity, finished">
        <RunActivity job={FINISHED} events={EVENTS} />
      </Example>
      <Example label="Run activity, failed">
        <RunActivity
          job={{
            ...FINISHED,
            id: 9102,
            status: "failed",
            error: "Example: the run stopped early.",
          }}
          events={EVENTS.slice(0, 1)}
        />
      </Example>
      <Example label="Notes saved and synced">
        <BrainSyncBanner unsaved={0} unpushed={0} />
      </Example>
      <Example label="Notes waiting to be saved and to reach GitHub">
        <BrainSyncBanner unsaved={3} unpushed={1} />
      </Example>
      <Example label="Saving paused while a run is recovered">
        <BrainSyncBanner unsaved={2} unpushed={0} paused />
      </Example>
      <Example label="Recovery banner">
        <RecoveryBanner pending={["9101"]} lastError="Example: could not move a file." />
      </Example>
    </div>
  );
}
