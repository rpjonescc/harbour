import type { ReactNode } from "react";
import { BrainStatus } from "@/components/agents/BrainStatus";
import { BrainHeader } from "@/components/brain/BrainHeader";
import { BrainNav } from "@/components/brain/BrainNav";
import { BrainSetupNotice } from "@/components/brain/BrainSetupNotice";
import { BrainTree } from "@/components/brain/BrainTree";
import { SearchDialog } from "@/components/brain/SearchDialog";
import { ViewedDocProvider } from "@/components/brain/ViewedDoc";
import { brainSyncStatus, quarantineRootFor } from "@/lib/agents/brain-status";
import { requireSession } from "@/lib/auth/guard";
import { ensureBrain } from "@/lib/brain/runtime";
import { listTree } from "@/lib/brain/tree";
import { brainStats, newDocPaths } from "@/lib/brain/views";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { brainVerdict } from "@/lib/explain/brain-page";
import { agoPhrase } from "@/lib/explain/tower";
import "./prose.css";

export default async function BrainLayout({ children }: { children: ReactNode }) {
  await requireSession();
  const status = ensureBrain();
  if (!status.available) return <BrainSetupNotice root={status.root} reason={status.reason} />;
  const { nodes, truncated } = listTree(status.root);
  const db = getDb();
  const config = getConfig();
  const fresh = [...newDocPaths(db)];
  const sync = brainSyncStatus(status.root, quarantineRootFor(config.HARBOUR_DB_PATH));
  const stats = brainStats(db);
  const verdict = brainVerdict({
    notes: stats.notes,
    fresh: fresh.length,
    lastChanged: stats.newest
      ? agoPhrase(stats.newest, new Date(), config.HARBOUR_TIMEZONE, config.HARBOUR_LOCALE)
      : null,
    unsaved: sync.sync?.unsaved ?? null,
    syncFailed: sync.syncFailed,
    recovering: sync.recovery.pending === null || sync.recovery.pending.length > 0,
  });
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <BrainHeader watchError={status.watchError} indexError={status.indexError} verdict={verdict}>
        <SearchDialog />
      </BrainHeader>
      <BrainStatus status={sync} />
      <ViewedDocProvider>
        <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <BrainNav>
            <BrainTree nodes={nodes} freshPaths={fresh} truncated={truncated} />
          </BrainNav>
          <div className="min-w-0">{children}</div>
        </div>
      </ViewedDocProvider>
    </div>
  );
}
