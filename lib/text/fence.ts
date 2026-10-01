/** A backtick fence (≥ 3) longer than any backtick run in `text`. */
export function fenceFor(text: string): string {
  // A reduce, not Math.max(...runs): spreading a huge match list can overflow the call stack.
  const longest = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}
