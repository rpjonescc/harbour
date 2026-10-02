/** A positive integer action id in canonical form ("12", never "012", "1e2" or "1.0"); else null. */
export function parseActionId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
