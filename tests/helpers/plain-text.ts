/** The text of `root` with every <details> (Technical details) left out, as a person sees it closed. */
export function textOutsideDetails(root: HTMLElement): string {
  const copy = root.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return "";
  for (const details of copy.querySelectorAll("details")) details.remove();
  return copy.textContent ?? "";
}
