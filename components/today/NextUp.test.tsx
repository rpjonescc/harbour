// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ActionPreview } from "@/lib/today/types";
import { NextUp, NOTHING_TO_DO } from "./NextUp";

const preview: ActionPreview = {
  id: 7,
  productId: "acme-docs",
  area: "GEO",
  impact: "high",
  effort: "small",
  title: "Publish an llms.txt guide",
  reason: "AI assistants find your best pages faster.",
  who: "claude",
  href: "/actions#action-7",
};

describe("NextUp", () => {
  it("is a region named by its Next up heading, with a card per action", () => {
    render(<NextUp actions={[preview]} more={0} />);
    expect(screen.getByRole("region", { name: "Next up" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: preview.title })).toBeInTheDocument();
  });

  it("says nothing is to do when there are no actions, and links to the rest", () => {
    const { rerender } = render(<NextUp actions={[]} more={0} />);
    expect(screen.getByText(NOTHING_TO_DO.what)).toBeInTheDocument();
    rerender(<NextUp actions={[preview]} more={2} />);
    expect(screen.getByRole("link", { name: "2 more on the Actions board" })).toHaveAttribute(
      "href",
      "/actions",
    );
  });
});
