import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { brainHref } from "@/lib/brain/wikilinks";

/** Fallback start page: recently changed documents. */
export function RecentDocs({ docs }: { docs: { path: string; title: string }[] }) {
  return (
    <Panel className="p-6">
      <h2 className="font-serif text-xl">Recently changed</h2>
      {docs.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          No documents yet. Add Markdown files to your brain folder.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {docs.map((doc) => (
            <li key={doc.path}>
              <Link href={brainHref(doc.path)} className="text-accent hover:underline">
                {doc.title}
              </Link>
              <span className="ml-2 font-mono text-xs text-ink-muted">{doc.path}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-ink-muted">
        Tip: create <code className="font-mono">00-start-here.md</code> to use it as this page.
      </p>
    </Panel>
  );
}
