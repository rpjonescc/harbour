// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ActionPreview } from "@/lib/today/types";
import { ActionCard } from "./ActionCard";

const TITLE = "Publish an llms.txt guide";
const preview = (over: Partial<ActionPreview> = {}): ActionPreview => ({
  id: 7,
  productId: "acme-docs",
  area: "GEO",
  impact: "high",
  effort: "small",
  title: TITLE,
  reason: "AI assistants find your best pages faster.",
  who: "claude",
  href: "/actions#action-7",
  ...over,
});

describe("ActionCard", () => {
  it("leads with the title, then why, the size of the job and who's on it, with no codes", () => {
    render(<ActionCard action={preview()} />);
    const card = screen.getByRole("article", { name: TITLE });
    expect(within(card).getByRole("link", { name: TITLE })).toHaveAttribute(
      "href",
      "/actions#action-7",
    );
    expect(card).toHaveTextContent("Big win");
    expect(card).toHaveTextContent("Recommended by AI assistants · quick job");
    expect(card).toHaveTextContent("AI assistants find your best pages faster.");
    expect(card).toHaveTextContent("Acme Docs · Claude is on it");
    expect(card).not.toHaveTextContent(/\b(?:SEO|GEO|AEO)\b/);
  });

  it.each([
    ["pr_waiting", "Pull request waiting for your OK"],
    ["you", "Waiting for you"],
    ["undecided", "New idea, not decided yet"],
  ] as const)("words %s as “%s”", (who, phrase) => {
    render(<ActionCard action={preview({ who })} />);
    expect(screen.getByRole("article")).toHaveTextContent(`Acme Docs · ${phrase}`);
  });

  // Review Focus 5: an agent's reason can be empty.
  it("leaves out an empty reason, an unknown who and the link for a sample", () => {
    render(<ActionCard action={preview({ reason: "", who: null, href: null })} />);
    const card = screen.getByRole("article", { name: TITLE });
    expect(screen.queryByRole("link")).toBeNull();
    expect(card.querySelectorAll("p")).toHaveLength(2);
    expect(card).not.toHaveTextContent(/on it|Waiting|not decided/);
  });
});
