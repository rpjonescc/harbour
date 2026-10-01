import { DocsLink } from "@/components/ui/DocsLink";
import { DOCS_LINKS } from "@/lib/docs-links";
import { SourcePanel } from "./SourcePanel";

const PANELS = [
  {
    id: "ai-engines",
    title: "AI engines",
    body: "Whether ChatGPT, Perplexity, Gemini and Claude mention and cite the product for its target questions.",
  },
  {
    id: "rankings",
    title: "Rankings",
    body: "Google positions for the product's approved keywords, and who owns the featured snippet.",
  },
] as const;

/** Sources that need paid API keys: shown as not connected until a later phase adds them. */
export function PaidSourcePanels() {
  return (
    <>
      {PANELS.map((panel) => (
        <SourcePanel key={panel.id} id={panel.id} title={panel.title} status="not-connected">
          <p className="text-sm text-ink-muted">{panel.body}</p>
          <p className="text-xs text-ink-muted">
            Not connected (needs API keys).{" "}
            <DocsLink href={DOCS_LINKS.scores}>What the scores use today</DocsLink>
          </p>
        </SourcePanel>
      ))}
    </>
  );
}
