// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { TechnicalDetails } from "./TechnicalDetails";

const KEY = "harbour:technical-details:example";

const example = () => (
  <TechnicalDetails id="example" topic="example scores">
    <p>seo.technical · weight 0.35</p>
  </TechnicalDetails>
);

function detailsElement(): HTMLDetailsElement {
  const details = screen.getByText(/^Technical details/).closest("details");
  if (!details) throw new Error("no <details>");
  return details;
}

/** What a click on the summary does: the browser flips `open`, then fires "toggle". */
function toggle(open: boolean) {
  const details = detailsElement();
  details.open = open;
  fireEvent(details, new Event("toggle"));
}

describe("TechnicalDetails", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("is closed by default, with a summary that names its topic", () => {
    render(example());
    expect(detailsElement().open).toBe(false);
    expect(detailsElement().querySelector("summary")).toHaveTextContent(
      "Technical details (example scores)",
    );
    expect(screen.getByText("seo.technical · weight 0.35")).not.toBeVisible();
  });

  it("remembers the owner's choice for the next visit", () => {
    const { unmount } = render(example());
    toggle(true);
    expect(localStorage.getItem(KEY)).toBe("open");
    unmount();
    render(example());
    expect(detailsElement().open).toBe(true);
    toggle(false);
    expect(localStorage.getItem(KEY)).toBe("closed");
  });

  it("keeps each section's choice apart", () => {
    localStorage.setItem("harbour:technical-details:other", "open");
    render(example());
    expect(detailsElement().open).toBe(false);
  });

  // Review Focus 4: storage can be blocked (private mode, policy).
  it("still opens and closes when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(example());
    expect(detailsElement().open).toBe(false);
    toggle(true);
    expect(detailsElement().open).toBe(true);
    expect(screen.getByText("seo.technical · weight 0.35")).toBeVisible();
  });
});
