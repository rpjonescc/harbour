import { DocPage } from "@/components/brain/DocPage";
import { RecentDocs } from "@/components/brain/RecentDocs";
import { requireSession } from "@/lib/auth/guard";
import { BrainPathError, resolveBrainPath } from "@/lib/brain/paths";
import { ensureBrain } from "@/lib/brain/runtime";
import { loadDocView } from "@/lib/brain/view-model";
import { recentDocs } from "@/lib/brain/views";
import { getDb } from "@/lib/db/client";

const START_DOC = "00-start-here.md";

function exists(root: string, path: string): boolean {
  try {
    resolveBrainPath(root, path);
    return true;
  } catch (error) {
    if (error instanceof BrainPathError) return false;
    throw error;
  }
}

export default async function BrainHomePage() {
  await requireSession();
  const status = ensureBrain();
  if (!status.available) return null; // the layout shows the setup notice
  if (exists(status.root, START_DOC)) {
    return <DocPage view={await loadDocView(status.root, START_DOC)} />;
  }
  return <RecentDocs docs={recentDocs(getDb())} />;
}
