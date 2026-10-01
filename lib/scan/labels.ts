// No collector imports here: the web UI reads labels without bundling the collectors.
const LABELS: Record<string, string> = {
  crawler: "Crawler",
  readiness: "Readiness",
  pagespeed: "PageSpeed",
  "search-console": "Search Console",
};

/** Owner-facing name of a collector, e.g. "Search Console". */
export function collectorLabel(id: string): string {
  return LABELS[id] ?? id;
}
