import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { DocsLink } from "@/components/ui/DocsLink";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { DOCS_LINKS } from "@/lib/docs-links";
import { sourceExplanation, sourceName, sourceStatusPhrase } from "@/lib/explain/sources";
import type { SourcesView } from "@/lib/scan/sources-view";

type Row = {
  id: "crawler" | "readiness" | "pagespeed" | "search-console";
  connected: boolean;
  note: string;
};

const DOCS: Partial<Record<Row["id"], { href: string; label: string }>> = {
  pagespeed: { href: DOCS_LINKS.pagespeed, label: "Connect PageSpeed" },
  "search-console": { href: DOCS_LINKS.searchConsole, label: "Connect Search Console" },
};

function searchConsoleRow(view: SourcesView): Row {
  const { connections } = view;
  const unlinked = view.products.filter((p) => !connections.searchConsoleProducts[p.productId]);
  const connected = connections.searchConsoleCredentials && unlinked.length < view.products.length;
  const names = unlinked.map((p) => p.name).join(" and ");
  const note = !connections.searchConsoleCredentials
    ? sourceExplanation("search-console").gives
    : unlinked.length > 0
      ? `${names} ${unlinked.length === 1 ? "isn't" : "aren't"} linked to a Search Console site yet.`
      : "Every site is linked.";
  return { id: "search-console", connected, note };
}

function rows(view: SourcesView): Row[] {
  const gives = (id: Row["id"]) => sourceExplanation(id).gives;
  return [
    { id: "crawler", connected: true, note: gives("crawler") },
    { id: "readiness", connected: true, note: gives("readiness") },
    { id: "pagespeed", connected: view.connections.pagespeed, note: gives("pagespeed") },
    searchConsoleRow(view),
  ];
}

/** Which data sources are connected, as set up on the Harbour machine. Never shows a secret. */
export function ConnectionList({ view }: { view: SourcesView }) {
  return (
    <Panel className="px-4">
      <ul aria-label="Connections" className="divide-y divide-line">
        {rows(view).map((row) => {
          const docs = DOCS[row.id];
          return (
            <li key={row.id} className="flex flex-col gap-1 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{sourceName(row.id)}</span>
                <Tag tone={row.connected ? "accent" : "neutral"}>
                  {sourceStatusPhrase(row.id, row.connected ? "ok" : "not_configured")}
                </Tag>
              </p>
              <p className="text-xs text-ink-muted">{row.note}</p>
              {!row.connected && docs && (
                <p className="text-xs">
                  <DocsLink href={docs.href}>{docs.label}</DocsLink>
                </p>
              )}
              {!row.connected && (
                <TechnicalDetails
                  id={`connect-${row.id}`}
                  topic={`how to connect ${sourceName(row.id)}`}
                >
                  <ol className="list-decimal pl-4">
                    {sourceExplanation(row.id).connect.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </TechnicalDetails>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
