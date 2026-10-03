import { IndexingPanel } from "@/components/products/IndexingPanel";
import { INDEXING_REASONS } from "@/lib/explain/indexing";
import type { IndexingState } from "@/lib/scan/indexing-view";

const BY_STATE = {
  indexed: 3,
  discovered_not_indexed: 40,
  crawled_not_indexed: 6,
  unknown_to_google: 2,
  blocked: 1,
  other: 1,
  unknown: 0,
};
const COUNTED = {
  state: "counted",
  indexed: 3,
  checked: 53,
  unknown: 0,
  total: 53,
  byState: BY_STATE,
  checkedThrough: "2026-10-01T06:00:00.000Z",
} as const;

/** Every state of the "Pages in Google" panel. */
const INDEXING_STATES: { label: string; indexing: IndexingState }[] = [
  { label: "Every page checked", indexing: COUNTED },
  { label: "Still checking a large site", indexing: { ...COUNTED, checked: 20, indexed: 1 } },
  {
    label: "Some pages couldn't be checked",
    indexing: {
      ...COUNTED,
      checked: 51,
      unknown: 2,
      byState: { ...BY_STATE, other: 0, blocked: 0, unknown: 2 },
    },
  },
  {
    label: "Search Console not connected",
    indexing: { state: "empty", why: "not_connected", reason: null },
  },
  {
    label: "No sitemap pages",
    indexing: { state: "empty", why: "no_sitemap", reason: "No sitemap pages were recorded" },
  },
  {
    label: "Google didn't answer",
    indexing: { state: "empty", why: "failed", reason: "Search Console refused access (HTTP 403)" },
  },
  {
    label: "The property doesn't cover the site",
    indexing: { state: "empty", why: "not_covered", reason: INDEXING_REASONS.notCovered },
  },
  {
    label: "The site couldn't be read",
    indexing: { state: "empty", why: "crawler_failed", reason: INDEXING_REASONS.crawlerFailed },
  },
  { label: "Google's daily limit", indexing: { state: "empty", why: "quota", reason: null } },
  { label: "No answer yet", indexing: { state: "empty", why: "no_answer", reason: null } },
  { label: "Not checked yet", indexing: { state: "empty", why: "waiting", reason: null } },
];

/** Every state of the "Pages in Google" panel, labelled. */
export function IndexingExamples({ locale }: { locale: string }) {
  return (
    <>
      {INDEXING_STATES.map(({ label, indexing }) => (
        <div key={label} className="flex flex-col gap-1">
          <p className="text-2xs uppercase tracking-widest text-ink-muted">
            Pages in Google · {label}
          </p>
          <IndexingPanel indexing={indexing} locale={locale} />
        </div>
      ))}
    </>
  );
}
