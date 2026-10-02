// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Product } from "@/lib/products/catalog";
import { deriveIssues } from "@/lib/scan/issues";
import { ACME_CRAWL, ALL_OK, readiness } from "@/tests/helpers/scoring";
import { IssueList } from "./IssueList";

const product: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
  kind: "product" as const,
};
const issues = deriveIssues([...ACME_CRAWL, readiness()], ALL_OK);
const INTRO = /Each problem says why it matters/;

const list = (items: typeof issues, scanned = true) =>
  render(
    <IssueList
      issues={items}
      actionByRule={new Map()}
      product={product}
      scanned={scanned}
      locale="en-GB"
    />,
  );

describe("IssueList", () => {
  it("opens with one sentence, then the issues", () => {
    list(issues);
    const intro = screen.getByText(INTRO);
    expect(intro.textContent?.match(/\./g)).toHaveLength(1);
    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
  });

  it.each([true, false])("leaves the intro off an empty list (scanned: %s)", (scanned) => {
    list([], scanned);
    expect(screen.queryByText(INTRO)).toBeNull();
    expect(screen.getByRole("heading", { name: "What to fix" })).toBeInTheDocument();
  });
});
