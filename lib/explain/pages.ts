/** A crawled page's HTTP status in plain words, keeping the code for tracking. */
export function pageResult(status: number): string {
  if (status >= 200 && status < 300) return `Loaded (${status})`;
  if (status >= 300 && status < 400) return `Moved (${status})`;
  if (status === 404 || status === 410) return `Not found (${status})`;
  if (status >= 400 && status < 500) return `Refused (${status})`;
  if (status >= 500) return `Server error (${status})`;
  return `No proper answer (${status})`;
}

/** One line above the pages table. The table lists the most troubled pages, so a cut-off count is "at least". */
export function pagesSummary(
  rows: readonly { problems: readonly string[] }[],
  total: number,
): string {
  const checked = `Harbour checked ${total} ${total === 1 ? "page" : "pages"}.`;
  const troubled = rows.filter((row) => row.problems.length > 0).length;
  if (troubled === 0) return `${checked} Nothing needs fixing.`;
  const atLeast = rows.length < total && troubled === rows.length ? "At least " : "";
  return `${checked} ${atLeast}${troubled} ${troubled === 1 ? "has" : "have"} something to fix.`;
}
