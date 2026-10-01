import { DocsLink } from "@/components/ui/DocsLink";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { DOCS_LINKS } from "@/lib/docs-links";
import type { SourcesView } from "@/lib/scan/sources-view";

type Row = {
  name: string;
  connected: boolean;
  note: string;
  docs?: { href: string; label: string };
};

function rows(view: SourcesView): Row[] {
  const { connections } = view;
  const missing = view.products.filter((p) => !connections.searchConsoleProducts[p.productId]);
  const gscNote = !connections.searchConsoleCredentials
    ? "No credentials file set (HARBOUR_GSC_CREDENTIALS)."
    : missing.length > 0
      ? `Credentials set. No property for ${missing.map((p) => p.name).join(", ")}.`
      : "Credentials set; every product names its property.";
  return [
    { name: "Crawler", connected: true, note: "Built in: reads each product's own site." },
    {
      name: "Readiness",
      connected: true,
      note: "Built in: robots.txt, llms.txt, sitemaps, schema.",
    },
    {
      name: "PageSpeed",
      connected: connections.pagespeed,
      note: connections.pagespeed
        ? "API key set. Runs weekly."
        : "No API key set (HARBOUR_PAGESPEED_API_KEY).",
      docs: { href: DOCS_LINKS.pagespeed, label: "Connect PageSpeed" },
    },
    {
      name: "Search Console",
      connected: connections.searchConsoleCredentials && missing.length < view.products.length,
      note: gscNote,
      docs: { href: DOCS_LINKS.searchConsole, label: "Connect Search Console" },
    },
  ];
}

/** Which sources are connected, as set up on the Harbour machine. Never shows a secret. */
export function ConnectionList({ view }: { view: SourcesView }) {
  return (
    <Panel className="px-4">
      <ul aria-label="Connections" className="divide-y divide-line">
        {rows(view).map((row) => (
          <li key={row.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
            <span className="w-32 text-sm font-medium">{row.name}</span>
            <Tag tone={row.connected ? "accent" : "neutral"}>
              {row.connected ? "Connected" : "Not connected"}
            </Tag>
            <span className="text-xs text-ink-muted">{row.note}</span>
            {row.docs && !row.connected && (
              <span className="text-xs">
                <DocsLink href={row.docs.href}>{row.docs.label}</DocsLink>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
