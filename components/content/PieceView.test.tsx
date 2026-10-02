// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { piece } from "./content-fixtures";
import { PieceView } from "./PieceView";

describe("PieceView", () => {
  it("shows the text as plain text, never as markup", () => {
    render(<PieceView piece={piece({ text: "Hello <b>world</b>\n\nSecond paragraph." })} />);
    const text = screen.getByText(/Hello <b>world<\/b>/);
    expect(text.className).toMatch(/whitespace-pre-wrap/);
    expect(document.querySelector("b")).toBeNull();
  });

  it("shows flags beside the piece and a plain sentence for Needs you", () => {
    render(
      <PieceView
        piece={piece({
          tab: "needs-you",
          needsYou: "Two claims don't trace to your notes. Check them or remove them.",
          flagLines: ["Check before posting: 1 pricing claim"],
        })}
      />,
    );
    expect(screen.getByText("Check before posting: 1 pricing claim")).toBeVisible();
    expect(screen.getByText(/Two claims don't trace/)).toBeVisible();
  });

  it("keeps gate keys, skill names and hashes inside Technical details only", () => {
    render(
      <PieceView
        piece={piece({
          gates: [
            {
              gate: "no-ai-slop",
              order: 1,
              attempt: 1,
              result: "pass",
              findings: [],
              questions: [],
              instructions: { name: "no-ai-slop", source: "s", sha256: "a".repeat(64) },
              jobId: 1,
              at: "2026-10-02T00:00:00Z",
              textBefore: "b".repeat(64),
              textAfter: "b".repeat(64),
            },
          ],
        })}
      />,
    );
    const details = screen.getByText(/Technical details/).closest("details");
    expect(details).not.toBeNull();
    const outside = document.body.cloneNode(true) as HTMLElement;
    outside.querySelector("details")?.remove();
    expect(outside.textContent).not.toMatch(/no-ai-slop|sha256|HARBOUR_/);
    expect(within(details as HTMLElement).getAllByText(/no-ai-slop/).length).toBeGreaterThan(0);
  });

  it("says a stub was not written, and offers no Copy button", () => {
    render(
      <PieceView
        piece={piece({
          empty: true,
          copy: [],
          needsYou: "The X piece wasn't written: it had 7 posts and the limit is 5.",
        })}
      />,
    );
    expect(screen.getByText(/wasn't written/)).toBeVisible();
    expect(screen.getAllByText(/wasn't written/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Copy/ })).toBeNull();
  });

  it("does not make a link in the text clickable", () => {
    render(
      <PieceView
        piece={piece({ text: "See https://example.com/x and [a](https://evil.example)" })}
      />,
    );
    const text = screen.getByText(/See https/);
    expect(text.querySelector("a")).toBeNull();
    expect(text.textContent).toContain("[a](https://evil.example)");
  });

  it("says a stub was not written, once, when it carries no reason of its own", () => {
    render(<PieceView piece={piece({ empty: true, copy: [], needsYou: null })} />);
    expect(
      screen.getByText(
        "This piece wasn't written. Discard it; the idea's other pieces are unaffected.",
      ),
    ).toBeVisible();
  });
});
