import { notFound } from "next/navigation";
import { DocPage } from "@/components/brain/DocPage";
import { requireSession } from "@/lib/auth/guard";
import { BrainPathError } from "@/lib/brain/paths";
import { ensureBrain } from "@/lib/brain/runtime";
import { type DocView, loadDocView } from "@/lib/brain/view-model";

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export default async function BrainDocPage({ params }: { params: Promise<{ path: string[] }> }) {
  await requireSession();
  const status = ensureBrain();
  if (!status.available) return null; // the layout shows the setup notice
  const { path } = await params;
  let view: DocView;
  try {
    view = await loadDocView(status.root, path.map(decode).join("/"));
  } catch (error) {
    if (error instanceof BrainPathError) notFound();
    throw error;
  }
  return <DocPage view={view} />;
}
