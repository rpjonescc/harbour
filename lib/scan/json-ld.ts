import { hasSchemaFamily } from "./schema-types";

/**
 * schema.org types declared in a page's JSON-LD blocks, and the newest `datePublished` of an
 * article-type node (ISO 8601; null when none has a valid one).
 */
export type JsonLdSummary = {
  types: string[];
  invalid: number;
  articleDatePublished: string | null;
};

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

/** The node's datePublished as epoch ms when it is an article-type node with a valid date. */
function articleDate(node: Record<string, unknown>): number | null {
  const published = node.datePublished;
  if (!hasSchemaFamily(typesOf(node), "Article") || typeof published !== "string") return null;
  const ms = Date.parse(published);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Reads JSON-LD block sources defensively: a block that isn't valid JSON counts as invalid,
 * values that aren't objects are ignored, and nested values other than `@graph` are not walked.
 */
export function summariseJsonLd(blocks: readonly string[]): JsonLdSummary {
  const types = new Set<string>();
  let invalid = 0;
  let newest: number | null = null;
  for (const block of blocks) {
    let value: unknown;
    try {
      value = JSON.parse(block);
    } catch {
      invalid++;
      continue;
    }
    for (const node of nodesOf(value)) {
      for (const type of typesOf(node)) types.add(type);
      const date = articleDate(node);
      if (date !== null && (newest === null || date > newest)) newest = date;
    }
  }
  const articleDatePublished = newest === null ? null : new Date(newest).toISOString();
  return { types: [...types].sort(), invalid, articleDatePublished };
}
