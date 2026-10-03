// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { DEEP_LINK_TEXT } from "@/lib/explain/board";
import { CardDeepLink } from "./CardDeepLink";

function page(hash: string, path = "/actions") {
  window.history.replaceState(null, "", `${path}${hash}`);
  return render(
    <>
      <div style={{ overflowX: "auto" }}>
        <article id="action-7" aria-labelledby="action-7-title">
          <h3 id="action-7-title" tabIndex={-1}>
            Add a sitemap
          </h3>
        </article>
      </div>
      <CardDeepLink />
    </>,
  );
}

describe("CardDeepLink", () => {
  const scrolled = vi.fn();
  beforeEach(() => {
    scrolled.mockReset();
    // jsdom has no layout, so no scrollIntoView of its own.
    Element.prototype.scrollIntoView = scrolled;
  });

  it("scrolls the linked card into view, sideways too, and focuses its title", () => {
    page("#action-7");
    expect(scrolled).toHaveBeenCalledWith({ block: "center", inline: "center" });
    expect(scrolled.mock.contexts[0]).toBe(document.getElementById("action-7"));
    expect(screen.getByRole("heading", { name: "Add a sitemap" })).toHaveFocus();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does nothing without a card link", () => {
    page("#column-queue");
    expect(scrolled).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says plainly when the card is not on this page and links to the full list", () => {
    page("#action-99", "/actions?product=acme-docs");
    expect(screen.getByRole("status")).toHaveTextContent(DEEP_LINK_TEXT.missing);
    expect(screen.getByRole("link", { name: DEEP_LINK_TEXT.everyStatus })).toHaveAttribute(
      "href",
      "/actions?product=acme-docs&view=list&status=all#action-99",
    );
  });
});
