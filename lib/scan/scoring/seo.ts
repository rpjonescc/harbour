import type { Vitals } from "./inputs";
import { indexability } from "./seo-indexability";
import { technicalHealth } from "./seo-technical";
import { searchTrend } from "./seo-trend";
import { measured, missing, type SubScore, type SubScoreSpec, withSources } from "./sub-score";

/** Google's INP thresholds (p75): good up to 200 ms, poor from 500 ms. */
const INP_GOOD_MS = 200;
const INP_POOR_MS = 500;

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function inpScore(ms: number): number {
  if (ms <= INP_GOOD_MS) return 100;
  if (ms >= INP_POOR_MS) return 0;
  return (100 * (INP_POOR_MS - ms)) / (INP_POOR_MS - INP_GOOD_MS);
}

/**
 * Core Web Vitals: the Lighthouse mobile performance score, averaged with field INP (Chrome UX
 * Report, rated 100 at ≤ 200 ms down to 0 at ≥ 500 ms) when Google has field data.
 */
export function coreWebVitals(vitals: Vitals): SubScore {
  const from = vitals.measuredOn ? `PageSpeed from ${vitals.measuredOn}` : "PageSpeed this scan";
  const field = vitals.fieldDataAvailable ? vitals.inpMs : null;
  const lab = vitals.performanceScore;
  if (lab === null && field === null) return missing(`${from}: no performance score or field INP`);
  const parts: number[] = [];
  const notes: string[] = [];
  if (lab !== null) {
    parts.push(lab);
    notes.push(`mobile performance ${lab}`);
  }
  if (field !== null) {
    const rated = inpScore(field);
    parts.push(rated);
    notes.push(`field INP ${field} ms (rated ${Math.round(rated)})`);
  } else {
    notes.push("no field data");
  }
  return measured(mean(parts), `${from}: ${notes.join(", ")}.`);
}

/** SEO sub-scores of formula v2; weights sum to 1. */
export const SEO_SUB_SCORES: readonly SubScoreSpec[] = [
  {
    key: "seo.technical",
    label: "Technical health",
    weight: 0.35,
    measure: (i) => withSources([i.crawl], technicalHealth),
  },
  {
    key: "seo.indexability",
    label: "Indexability",
    weight: 0.25,
    measure: (i) => withSources([i.crawl, i.readiness], indexability),
  },
  {
    key: "seo.cwv",
    label: "Core Web Vitals",
    weight: 0.2,
    measure: (i) => withSources([i.vitals], coreWebVitals),
  },
  {
    key: "seo.searchTrend",
    label: "Search impressions trend",
    weight: 0.2,
    measure: (i) => withSources([i.searchConsole], searchTrend),
  },
];
