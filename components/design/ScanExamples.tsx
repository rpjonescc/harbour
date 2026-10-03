import { AreaCards } from "@/components/products/AreaCards";
import { IssueItem } from "@/components/products/IssueItem";
import { PagesTable } from "@/components/products/PagesTable";
import { PaidSourcePanels } from "@/components/products/PaidSourcePanels";
import { ScanNowButton } from "@/components/products/ScanNowButton";
import { ScanStatusNote } from "@/components/products/ScanStatusNote";
import { ScoreBreakdown } from "@/components/products/ScoreBreakdown";
import { ScoringNote } from "@/components/products/ScoringNote";
import { SearchConsolePanel } from "@/components/products/SearchConsolePanel";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { ScoreValue } from "@/components/ui/ScoreValue";
import { Tabs } from "@/components/ui/Tabs";
import type { RuleActionStatus } from "@/lib/actions/views";
import { AREAS } from "@/lib/explain/areas";
import { IndexingExamples } from "./IndexingExamples";
import { OutsideExamples } from "./OutsideExamples";
import {
  EXAMPLE_ISSUE,
  EXAMPLE_PRODUCT,
  EXAMPLE_SCAN_STATES,
  EXAMPLE_SCORES,
} from "./scan-example-data";

const ZONE = { timeZone: "Europe/London", locale: "en-GB" };

/** Every state an issue card's action chip can show. */
const ISSUE_STATES: { label: string; action: RuleActionStatus | null }[] = [
  {
    label: "Claude is on it",
    action: { id: 1, status: "in_progress", snoozedUntil: null, who: "claude" },
  },
  { label: "Open", action: { id: 2, status: "open", snoozedUntil: null, who: "you" } },
  { label: "Done, still found", action: { id: 3, status: "done", snoozedUntil: null, who: null } },
  { label: "Snoozed", action: { id: 4, status: "snoozed", snoozedUntil: "2026-10-20", who: null } },
  { label: "Not tracked yet", action: null },
];

/** Fictional product-page states for checking the scan components in both themes. */
export function ScanExamples() {
  const breakdown = EXAMPLE_SCORES.latest?.breakdown ?? [];
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">Illustrative scores, checks and issues.</p>
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <ScoreValue value={78} delta={4} />
        <ScoreValue value={46} delta={-2} complete={false} />
        <ScoreValue value={null} />
        <div className="flex w-40 flex-col gap-1">
          <ScoreBar value={84} />
          <ScoreBar value={52} />
          <ScoreBar value={18} />
          <ScoreBar value={null} />
        </div>
        <ScanNowButton productId={EXAMPLE_PRODUCT.id} active={null} demo />
      </div>
      <ScoringNote change={{ from: "v1", to: "v2", at: new Date("2026-09-28T06:00:00Z") }} />
      <AreaCards
        scores={EXAMPLE_SCORES}
        scan={EXAMPLE_SCAN_STATES[0]?.scan ?? { active: null, last: null }}
      />
      {EXAMPLE_SCAN_STATES.map(({ label, scan }) => (
        <div key={label} className="flex flex-col gap-1">
          <p className="text-2xs uppercase tracking-widest text-ink-muted">{label}</p>
          <ScanStatusNote scan={scan} latest={EXAMPLE_SCORES.latest} {...ZONE} />
        </div>
      ))}
      <Tabs
        label="Example score breakdown"
        tabs={[
          {
            id: "seo",
            label: AREAS.seo.name,
            panel: <ScoreBreakdown area="seo" entries={breakdown} complete />,
          },
          {
            id: "geo",
            label: AREAS.geo.name,
            panel: <ScoreBreakdown area="geo" entries={breakdown} complete={false} />,
          },
          {
            id: "aeo",
            label: AREAS.aeo.name,
            panel: <ScoreBreakdown area="aeo" entries={[]} complete={false} />,
          },
        ]}
      />
      {ISSUE_STATES.map(({ label, action }) => (
        <div key={label} className="flex flex-col gap-1">
          <p className="text-2xs uppercase tracking-widest text-ink-muted">Issue · {label}</p>
          <IssueItem
            issue={{ ...EXAMPLE_ISSUE, id: `${EXAMPLE_ISSUE.id}-${action?.id ?? "none"}` }}
            action={action}
            product={EXAMPLE_PRODUCT}
            locale={ZONE.locale}
          />
        </div>
      ))}
      <PagesTable
        total={2}
        rows={[
          {
            url: "https://docs.example.com/pricing",
            status: 200,
            title: null,
            problems: ["Missing title", "Missing description"],
          },
          {
            url: "https://docs.example.com/old",
            status: 404,
            title: null,
            problems: ["Didn't load"],
          },
        ]}
      />
      <IndexingExamples locale={ZONE.locale} />
      <OutsideExamples locale={ZONE.locale} />
      <SearchConsolePanel
        locale={ZONE.locale}
        search={{
          state: "ok",
          summary: {
            startDate: "2026-09-01",
            endDate: "2026-09-28",
            days: [3, 5, 4, 7, 6, 9, 8].map((clicks, i) => ({
              date: `2026-09-0${i + 1}`,
              clicks,
              impressions: clicks * 40,
            })),
            clicks: 42,
            impressions: 1680,
            topQueries: [{ query: "acme docs setup", clicks: 18, impressions: 300, position: 2.4 }],
          },
        }}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <PaidSourcePanels />
      </div>
    </div>
  );
}
