import Link from "next/link";
import type { OutlineItem } from "@/lib/brain/render";
import { brainHref } from "@/lib/brain/wikilinks";

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname : url;
}

const HEADING = "text-2xs uppercase tracking-widest text-ink-muted";

/** Outline, backlinks and sources beside (or below) the document. */
export function ContextRail({
  outline,
  linkedFrom,
  sources,
}: {
  outline: OutlineItem[];
  linkedFrom: { path: string; title: string }[];
  sources: string[];
}) {
  return (
    <aside aria-label="Document context" className="flex flex-col gap-6 text-sm">
      {outline.length > 0 && (
        <section>
          <h2 className={HEADING}>On this page</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {outline.map((item) => (
              <li key={item.id} className={item.depth === 3 ? "pl-3" : undefined}>
                <a href={`#${item.id}`} className="text-ink-muted hover:text-ink">
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {linkedFrom.length > 0 && (
        <section>
          <h2 className={HEADING}>Linked from</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {linkedFrom.map((link) => (
              <li key={link.path}>
                <Link href={brainHref(link.path)} className="text-accent hover:underline">
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sources.length > 0 && (
        <section>
          <h2 className={HEADING}>Sources · {sources.length}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {sources.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-muted hover:text-ink"
                >
                  ↗ {hostOf(url)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
