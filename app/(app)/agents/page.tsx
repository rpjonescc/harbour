import { BrainStatus } from "@/components/agents/BrainStatus";
import { JobList } from "@/components/agents/JobList";
import { ResearchRefreshPanel } from "@/components/agents/ResearchRefreshPanel";
import { RunPanel } from "@/components/agents/RunPanel";
import { WeeklyAnalystPanel } from "@/components/agents/WeeklyAnalystPanel";
import { PageHeader } from "@/components/explain/PageHeader";
import { brainSyncStatus, quarantineRootFor } from "@/lib/agents/brain-status";
import { refreshPanelView } from "@/lib/agents/refresh-view";
import { weeklyPanelView } from "@/lib/analyst/panel-view";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { AGENT_PURPOSE, AGENTS_INTRO } from "@/lib/explain/agents";
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
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader title="Agents" intro={AGENTS_INTRO} page="agents" />
      <BrainStatus status={status} />
      <RunPanel products={products.map(({ id, name }) => ({ id, name }))} tokenSet={tokenSet} />
      <WeeklyAnalystPanel view={weekly} />
      <ResearchRefreshPanel view={refresh} />
      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-xl">Recent runs</h2>
        <p className="text-sm text-ink-muted">{AGENT_PURPOSE.recent}</p>
        <JobList
          jobs={jobs}
          products={getNamedProducts()}
          timeZone={config.HARBOUR_TIMEZONE}
          locale={config.HARBOUR_LOCALE}
          importsGivenUp={importsGivenUp(
            db,
            jobs.map((job) => job.id),
          )}
        />
      </section>
    </div>
  );
}
