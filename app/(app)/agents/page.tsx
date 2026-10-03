import { BrainStatus } from "@/components/agents/BrainStatus";
import { JobList } from "@/components/agents/JobList";
import { ResearchRefreshPanel } from "@/components/agents/ResearchRefreshPanel";
import { RunPanel } from "@/components/agents/RunPanel";
import { WeeklyAnalystPanel } from "@/components/agents/WeeklyAnalystPanel";
import { PageHeader } from "@/components/explain/PageHeader";
import { TermLine } from "@/components/explain/TermLine";
import { Panel } from "@/components/ui/Panel";
import { brainSyncStatus, quarantineRootFor } from "@/lib/agents/brain-status";
import { refreshPanelView } from "@/lib/agents/refresh-view";
import { weeklyPanelView } from "@/lib/analyst/panel-view";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { AGENT_PURPOSE, AGENTS_INTRO, agentsVerdict } from "@/lib/explain/agents";
import { jobWords } from "@/lib/explain/job-words";
import { importsGivenUp, listJobs } from "@/lib/jobs/queue";
import { getNamedProducts, getProducts } from "@/lib/products/catalog";

export default async function AgentsPage() {
  await requireSession();
  const config = getConfig();
  const db = getDb();
  const products = getProducts();
  const tokenSet = Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN);
  const status = brainSyncStatus(
    config.HARBOUR_BRAIN_DIR,
    quarantineRootFor(config.HARBOUR_DB_PATH),
  );
  const jobs = listJobs(db);
  const named = getNamedProducts();
  const verdict = agentsVerdict(
    jobs.map((job) => ({ status: job.status, doing: jobWords(job, named).doing })),
  );
  const weekly = weeklyPanelView(
    db,
    {
      timeZone: config.HARBOUR_TIMEZONE,
      locale: config.HARBOUR_LOCALE,
      enabled: config.HARBOUR_SCHEDULED_ANALYST === "on",
      tokenSet,
    },
    new Date(),
  );
  const refresh = refreshPanelView(
    {
      root: config.HARBOUR_BRAIN_DIR,
      timeZone: config.HARBOUR_TIMEZONE,
      locale: config.HARBOUR_LOCALE,
      enabled: config.HARBOUR_SCHEDULED_RESEARCH === "on",
      tokenSet,
    },
    new Date(),
  );
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Agents"
        page="agents"
        verdict={verdict}
        intro={
          <p>
            <TermLine line={AGENTS_INTRO} />{" "}
            <a href="#recent-runs" className="rounded-sm text-accent hover:underline">
              See recent runs
            </a>
          </p>
        }
      />
      <BrainStatus status={status} />
      <RunPanel products={products.map(({ id, name }) => ({ id, name }))} tokenSet={tokenSet} />
      <WeeklyAnalystPanel view={weekly} />
      <ResearchRefreshPanel view={refresh} />
      <section
        id="recent-runs"
        aria-labelledby="recent-runs-heading"
        className="flex scroll-mt-4 flex-col gap-3"
      >
        <h2 id="recent-runs-heading" className="font-serif text-xl">
          Recent runs
        </h2>
        <p className="text-sm text-ink-muted">{AGENT_PURPOSE.recent}</p>
        <Panel className="px-4 py-2">
          <JobList
            jobs={jobs}
            products={named}
            timeZone={config.HARBOUR_TIMEZONE}
            locale={config.HARBOUR_LOCALE}
            importsGivenUp={importsGivenUp(
              db,
              jobs.map((job) => job.id),
            )}
          />
        </Panel>
      </section>
    </div>
  );
}
