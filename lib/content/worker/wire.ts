import { approvedPillars } from "@/lib/agents/proposals";
import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import type { RunDeps } from "@/lib/jobs/run-job";
import { getContentProducts, getExcludeApps } from "@/lib/products/catalog";
import { type ChainDeps, chainHook, resumeChains } from "./chain-controller";
import type { DecisionDeps } from "./decision-job";

type Wiring = { db: Db; root: string; config: Config; now: () => Date };

const chainDeps = ({ db, root, config, now }: Wiring): ChainDeps => ({
  db,
  root,
  timeZone: config.HARBOUR_TIMEZONE,
  dailyRuns: config.HARBOUR_CONTENT_DAILY_RUNS,
  now,
});

/** The content machine's part of a run's deps: its inputs and its chain; nothing when it is off. */
export function contentRunDeps(w: Wiring): Pick<RunDeps, "content" | "afterOk"> {
  if (w.config.HARBOUR_CONTENT !== "on") return {};
  return {
    content: {
      root: w.root,
      skillsDir: w.config.HARBOUR_SKILLS_DIR,
      products: getContentProducts(),
      excludeApps: getExcludeApps(),
      approvedPillars: (id) => approvedPillars(w.db, id),
    },
    afterOk: chainHook(chainDeps(w)),
  };
}

/** At startup: queues the step a chain lost when the worker last stopped; how many it queued. */
export function resumeContentChains(w: Wiring): number {
  return w.config.HARBOUR_CONTENT === "on" ? resumeChains(chainDeps(w)) : 0;
}

/** What the decision job needs: the brain, where interrupted runs wait, and the products with content on. */
export const decisionDeps = (w: Wiring & { quarantineRoot: string }): DecisionDeps => ({
  enabled: w.config.HARBOUR_CONTENT === "on",
  db: w.db,
  root: w.root,
  quarantineRoot: w.quarantineRoot,
  now: w.now,
  timeZone: w.config.HARBOUR_TIMEZONE,
  products: getContentProducts(),
});
