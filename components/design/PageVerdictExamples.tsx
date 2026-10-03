import { PageHeader } from "@/components/explain/PageHeader";
import { TermLine } from "@/components/explain/TermLine";
import { agentsVerdict } from "@/lib/explain/agents";
import { brainVerdict } from "@/lib/explain/brain-page";
import { CONTENT_INTRO, contentVerdict } from "@/lib/explain/content";
import { settingsVerdict } from "@/lib/explain/settings";
import { sourcesVerdict } from "@/lib/explain/sources-page";
import { Example } from "./Example";

const NONE = { ready: 0, "needs-you": 0, ideas: 0, writing: 0, approved: 0, discarded: 0 };

/** Fictional page verdicts, one per tone, built by the same functions the pages use. */
const EXAMPLES = [
  {
    label: "Fine",
    title: "Agents",
    page: "agents",
    verdict: agentsVerdict(Array.from({ length: 5 }, () => ({ status: "ok", doing: "" }))),
  },
  {
    label: "Working",
    title: "Agents",
    page: "agents",
    verdict: agentsVerdict([
      { status: "running", doing: "checking Acme Docs" },
      { status: "ok", doing: "" },
    ]),
  },
  {
    label: "Worth a look",
    title: "Content",
    page: "content",
    verdict: contentVerdict({ ...NONE, ready: 3, ideas: 2 }),
  },
  {
    label: "Needs you",
    title: "Settings",
    page: "settings",
    verdict: settingsVerdict({
      demo: false,
      backup: "failed",
      claudeConnected: true,
      brokenKeyFiles: [],
      budgetReached: false,
      optionalMissing: 0,
      awaitingApproval: 0,
    }),
  },
  {
    label: "Can't tell yet",
    title: "Sources",
    page: "sources",
    verdict: sourcesVerdict([{ name: "Acme Docs", checking: false, checked: false, failed: [] }]),
  },
  {
    label: "Notes",
    title: "Second Brain",
    page: "brain",
    verdict: brainVerdict({
      notes: 42,
      fresh: 2,
      lastChanged: "4 min ago",
      unsaved: 0,
      syncFailed: false,
      recovering: false,
    }),
  },
] as const;

/** Page headers that lead with a verdict, and an intro whose glossary words explain themselves. */
export function PageVerdictExamples() {
  return (
    <div className="flex flex-col gap-6">
      {EXAMPLES.map(({ label, title, page, verdict }) => (
        <Example key={label} label={`Page verdict · ${label}`}>
          <PageHeader title={title} page={page} verdict={verdict} titleLevel={2} />
        </Example>
      ))}
      <Example label="Term line · an intro with glossary words">
        <p className="text-sm text-ink-muted">
          <TermLine line={CONTENT_INTRO} />
        </p>
      </Example>
    </div>
  );
}
