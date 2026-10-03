/** The action id in a `#action-<id>` link, or null for any other hash. */
export function deepLinkedId(hash: string): number | null {
  const match = /^#action-(\d+)$/.exec(hash);
  return match ? Number(match[1]) : null;
}

/**
 * Where a linked card that is not on this page can still be found: the list with every status,
 * keeping the product and area filters. Null when the page already is that list.
 */
export function everyStatusHref(current: URL, id: number): string | null {
  const params = new URLSearchParams();
  for (const key of ["product", "area"]) {
    const value = current.searchParams.get(key);
    if (value) params.set(key, value);
  }
  params.set("view", "list");
  params.set("status", "all");
  const isThere =
    current.searchParams.get("view") === "list" && current.searchParams.get("status") === "all";
  return isThere ? null : `/actions?${params.toString()}#action-${id}`;
}
