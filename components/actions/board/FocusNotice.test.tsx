// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ActionFilter } from "@/lib/actions/views";
import { FocusNotice } from "./FocusNotice";

const ALL: ActionFilter = { productId: null, area: null, status: "active" };

describe("FocusNotice", () => {
  it("says nothing without a focus", () => {
    const { container } = render(<FocusNotice focus={null} filter={ALL} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says what is filtered and links back to everything", () => {
    render(<FocusNotice focus="stuck" filter={ALL} />);
    expect(screen.getByRole("status")).toHaveTextContent("Showing only the stuck jobs.");
    expect(screen.getByRole("link", { name: "Show everything" })).toHaveAttribute(
      "href",
      "/actions",
    );
  });

  it("keeps the product and area filters when it clears the focus", () => {
    render(
      <FocusNotice
        focus="needs-you"
        filter={{ productId: "acme-docs", area: "SEO", status: "active" }}
      />,
    );
    expect(screen.getByText("Showing only the jobs that need you.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show everything" })).toHaveAttribute(
      "href",
      "/actions?product=acme-docs&area=SEO",
    );
  });
});
