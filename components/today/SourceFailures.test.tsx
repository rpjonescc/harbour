// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { SourceFailures } from "./SourceFailures";

describe("SourceFailures", () => {
  it("says what happened, whether it matters and what to do, with raw errors tucked away", () => {
    render(
      <SourceFailures
        failures={[
          {
            productId: "acme-docs",
            collector: "pagespeed",
            error: "PageSpeed Insights quota exceeded",
          },
        ]}
      />,
    );
    const notice = screen.getByRole("region", {
      name: "Google speed test (PageSpeed) had a problem in the last check",
    });
    expect(notice).toHaveTextContent("Google speed test (PageSpeed) · Acme Docs");
    expect(notice).toHaveTextContent(
      "Scores that use this data are marked as missing some data until it works again.",
    );
    expect(within(notice).getByRole("link", { name: "check your data sources" })).toHaveAttribute(
      "href",
      "/settings/sources",
    );
    expect(screen.getByText(/PageSpeed Insights quota exceeded/)).not.toBeVisible();
  });

  it("counts several failing sources once each, and says when no error was recorded", () => {
    render(
      <SourceFailures
        failures={[
          { productId: "acme-docs", collector: "pagespeed", error: null },
          { productId: "fern-and-field", collector: "crawler", error: "Could not crawl" },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "2 data sources had a problem in the last check" }),
    ).toBeInTheDocument();
    expect(screen.getByText("pagespeed · acme-docs: no error recorded")).toBeInTheDocument();
  });

  it("shows nothing when every source worked", () => {
    const { container } = render(<SourceFailures failures={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
