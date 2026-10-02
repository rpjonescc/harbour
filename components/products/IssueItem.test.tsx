// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { Product } from "@/lib/products/catalog";
import { deriveIssues } from "@/lib/scan/issues";
import { ACME_CRAWL, ALL_OK, readiness } from "@/tests/helpers/scoring";
import { IssueItem } from "./IssueItem";

const product: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
};
// The real rules over Acme Docs' crawl: the first issue is the broken link.
const [broken] = deriveIssues([...ACME_CRAWL, readiness()], ALL_OK);
const issue = (() => {
  if (!broken) throw new Error("expected an issue");
  return broken;
})();

const renderIssue = () =>
  render(
    <IssueItem
      issue={issue}
      action={{ id: 5, status: "in_progress", snoozedUntil: null }}
      product={product}
      locale="en-GB"
    />,
  );

describe("IssueItem", () => {
  it("leads with the plain words: size of win, effort, status, the title and why it matters", () => {
    renderIssue();
    const card = screen.getByRole("article", { name: "1 page you link to can't be found" });
    for (const text of ["Big win", "an afternoon", "In progress"]) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    expect(within(card).getByText(issue.problem)).toBeInTheDocument();
    expect(within(card).queryByText("SEO")).toBeNull();
  });

  it("folds the area, where, the fix, the check and the hand-off into one Technical details section", () => {
    renderIssue();
    const details = screen.getByText(/Technical details/).closest("details") as HTMLElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText(/Found on Google/)).toBeInTheDocument();
    expect(within(details).getByText(issue.fix)).toBeInTheDocument();
    expect(within(details).getByText(issue.check)).toBeInTheDocument();
    expect(within(details).getByText(/\/missing \(HTTP 404\)/)).toBeInTheDocument();
    expect(
      within(details).getByRole("button", { name: `Hand to Claude: ${issue.title}` }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("details details")).toHaveLength(0);
  });

  it("remembers Technical details per issue, not once for every card", () => {
    localStorage.setItem("harbour:technical-details:issue-other-rule", "open");
    const { unmount } = renderIssue();
    expect(screen.getByText(/Technical details/).closest("details")).not.toHaveAttribute("open");
    unmount();
    localStorage.setItem(`harbour:technical-details:issue-${issue.id}`, "open");
    renderIssue();
    expect(screen.getByText(/Technical details/).closest("details")).toHaveAttribute("open");
    localStorage.clear();
  });

  it("keeps a per-card link to the Actions board outside the fold", () => {
    renderIssue();
    const link = screen.getByRole("link", {
      name: `View on the Actions board: ${issue.title}`,
    });
    expect(link).toHaveAttribute("href", "/actions?product=acme-docs&status=all#action-5");
    expect(link.closest("details")).toBeNull();
  });
});
