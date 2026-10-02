import { DocsLink } from "@/components/ui/DocsLink";
import { DOCS_LINKS } from "@/lib/docs-links";
import { NOT_COLLECTED_YET, sourceStatusPhrase } from "@/lib/explain/sources";
import { SourcePanel } from "./SourcePanel";

const PANELS = [
  {
    id: "ai-engines",
    sourceId: "openai",
    title: "What AI assistants say about you",
    body: "Whether ChatGPT, Perplexity, Gemini and Claude mention and link to your site when people ask their questions.",
  },
  {
    id: "rankings",
    sourceId: "dataforseo",
    title: "Where you rank on Google",
    body: "Where your pages appear on Google for the searches you care about, and who gets the answer box at the top.",
  },
] as const;

/** Paid data that Harbour doesn't collect yet: said plainly, with no setting names. */
export function PaidSourcePanels() {
  return (
    <>
      {PANELS.map((panel) => (
        <SourcePanel
          key={panel.id}
          id={panel.id}
          title={panel.title}
          status="not-connected"
          statusLabel={sourceStatusPhrase(panel.sourceId, "not_configured")}
        >
          <p className="text-sm text-ink-muted">{panel.body}</p>
          <p className="text-xs text-ink-muted">
            {NOT_COLLECTED_YET}{" "}
            <DocsLink href={DOCS_LINKS.scores}>
              What the scores use today<span className="sr-only"> ({panel.title})</span>
            </DocsLink>
          </p>
        </SourcePanel>
      ))}
    </>
  );
}
