/**
 * Applies a Google API `fields` mask (partial response) to a JSON value, as the API would:
 * "a/b" selects b inside a, "a(b,c)" selects b and c inside a, and arrays apply the mask to
 * each item. Supports the subset of the syntax our requests use.
 */
export function applyFieldMask(value: unknown, mask: string): unknown {
  return select(value, parseList(mask, { at: 0 }));
}

type Selection = Map<string, Selection | null>;

function parseList(mask: string, pos: { at: number }): Selection {
  const selection: Selection = new Map();
  while (pos.at < mask.length && mask[pos.at] !== ")") {
    parseItem(mask, pos, selection);
    if (mask[pos.at] === ",") pos.at++;
  }
  return selection;
}

function parseItem(mask: string, pos: { at: number }, into: Selection): void {
  const start = pos.at;
  while (pos.at < mask.length && !"/(),".includes(mask[pos.at] ?? "")) pos.at++;
  const name = mask.slice(start, pos.at);
  const existing = into.get(name);
  const child: Selection = existing instanceof Map ? existing : new Map();
  if (mask[pos.at] === "/") {
    pos.at++;
    parseItem(mask, pos, child);
    into.set(name, child);
  } else if (mask[pos.at] === "(") {
    pos.at++;
    for (const [key, sub] of parseList(mask, pos)) child.set(key, sub);
    pos.at++; // ")"
    into.set(name, child);
  } else {
    into.set(name, null);
  }
}

function select(value: unknown, selection: Selection | null): unknown {
  if (selection === null) return value;
  if (Array.isArray(value)) return value.map((item) => select(item, selection));
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, sub] of selection) {
    if (key in record) out[key] = select(record[key], sub);
  }
  return out;
}
