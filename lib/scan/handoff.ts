import type { Product } from "@/lib/products/catalog";
import type { Issue } from "./issues";

/**
 * The "Hand to Claude" prompt for one issue: product, problem, URLs, suggested fix and an
 * acceptance check, as plain text. Only the product's public name and URL and the scan's own
 * findings go in — never settings or credentials.
 */
export function handoffPrompt(product: Pick<Product, "name" | "url">, issue: Issue): string {
  const article = issue.area === "GEO" ? "a" : "an";
  const more = issue.total - issue.locations.length;
  const urls = issue.locations.map((location) => `- ${location}`);
  if (more > 0) urls.push(`- …and ${more} more`);
  return [
    `Fix ${article} ${issue.area} issue on ${product.name} (${product.url}), found by Harbour's site scan.`,
    "",
    `Problem: ${issue.title}. ${issue.problem}`,
    "",
    "Affected URLs:",
    ...urls,
    "",
    `Suggested fix: ${issue.fix}`,
    "",
    `Acceptance check: ${issue.check} Harbour's next scan no longer lists this issue.`,
  ].join("\n");
}
