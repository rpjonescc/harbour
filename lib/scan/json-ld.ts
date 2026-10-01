/** schema.org types declared in a page's JSON-LD blocks. */
export type JsonLdSummary = { types: string[]; invalid: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Top-level nodes of one block: the object itself, array items, and `@graph` members. */
function nodesOf(value: unknown): Record<string, unknown>[] {
  const items = Array.isArray(value) ? value : [value];
  return items.filter(isRecord).flatMap((node) => {
    const graph = Array.isArray(node["@graph"]) ? node["@graph"].filter(isRecord) : [];
    return [node, ...graph];
  });
}

function typesOf(node: Record<string, unknown>): string[] {
  const type = node["@type"];
  const list = Array.isArray(type) ? type : [type];
  return list.filter((t): t is string => typeof t === "string" && t.length > 0);
}

/**
 * Reads JSON-LD block sources defensively: a block that isn't valid JSON counts as invalid,
 * values that aren't objects are ignored, and nested values other than `@graph` are not walked.
 */
export function summariseJsonLd(blocks: readonly string[]): JsonLdSummary {
  const types = new Set<string>();
  let invalid = 0;
  for (const block of blocks) {
    let value: unknown;
    try {
      value = JSON.parse(block);
    } catch {
      invalid++;
      continue;
    }
    for (const node of nodesOf(value)) for (const type of typesOf(node)) types.add(type);
  }
  return { types: [...types].sort(), invalid };
}
