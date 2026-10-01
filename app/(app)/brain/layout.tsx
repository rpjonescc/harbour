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
import { newDocPaths } from "@/lib/brain/views";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import "./prose.css";

export default async function BrainLayout({ children }: { children: ReactNode }) {
  await requireSession();
  const status = ensureBrain();
  if (!status.available) return <BrainSetupNotice root={status.root} reason={status.reason} />;
  const { nodes, truncated } = listTree(status.root);
  const fresh = [...newDocPaths(getDb())];
  const sync = brainSyncStatus(status.root, quarantineRootFor(getConfig().HARBOUR_DB_PATH));
  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <BrainStatus status={sync} />
      <BrainHeader watchError={status.watchError} indexError={status.indexError}>
        <SearchDialog />
      </BrainHeader>
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
