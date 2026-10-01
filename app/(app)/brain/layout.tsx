import type { ReactNode } from "react";
import { BrainHeader } from "@/components/brain/BrainHeader";
import { BrainNav } from "@/components/brain/BrainNav";
import { BrainSetupNotice } from "@/components/brain/BrainSetupNotice";
import { BrainTree } from "@/components/brain/BrainTree";
import { SearchDialog } from "@/components/brain/SearchDialog";
import { requireSession } from "@/lib/auth/guard";
import { ensureBrain } from "@/lib/brain/runtime";
import { listTree } from "@/lib/brain/tree";
import { newDocPaths } from "@/lib/brain/views";
import { getDb } from "@/lib/db/client";
import "./prose.css";

export default async function BrainLayout({ children }: { children: ReactNode }) {
  await requireSession();
  const status = ensureBrain();
  if (!status.available) return <BrainSetupNotice root={status.root} reason={status.reason} />;
  const { nodes, truncated } = listTree(status.root);
  const fresh = [...newDocPaths(getDb())];
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <BrainHeader watchError={status.watchError} indexError={status.indexError}>
        <SearchDialog />
      </BrainHeader>
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <BrainNav>
          <BrainTree nodes={nodes} freshPaths={fresh} truncated={truncated} />
        </BrainNav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
