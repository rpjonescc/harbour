/** A backtick fence (≥ 3) longer than any backtick run in `text`. */
export function fenceFor(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = Math.max(0, ...runs.map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}
