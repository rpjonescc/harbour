import { BrainStatus } from "@/components/agents/BrainStatus";
import { JobList } from "@/components/agents/JobList";
import { RunPanel } from "@/components/agents/RunPanel";
import { brainSyncStatus, quarantineRootFor } from "@/lib/agents/brain-status";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { listJobs } from "@/lib/jobs/queue";
import { getProducts } from "@/lib/products/catalog";

export default async function AgentsPage() {
  await requireSession();
  const config = getConfig();
  const products = getProducts();
  const status = brainSyncStatus(
    config.HARBOUR_BRAIN_DIR,
    quarantineRootFor(config.HARBOUR_DB_PATH),
  );
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl">Agents</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Research and discovery agents write into your Second Brain. One runs at a time.
        </p>
      </header>
      <BrainStatus status={status} />
      <RunPanel
        products={products.map(({ id, name }) => ({ id, name }))}
        tokenSet={Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN)}
      />
      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-xl">Recent runs</h2>
        <JobList
          jobs={listJobs(getDb())}
          products={products}
          timeZone={config.HARBOUR_TIMEZONE}
          locale={config.HARBOUR_LOCALE}
        />
      </section>
    </div>
  );
}
