// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { SAMPLE_NOTE } from "@/lib/explain/voice/fallback";
import type { NoteSlot } from "@/lib/note/view";
import { GOOD_NOTE } from "@/tests/helpers/note";
import { NoteCard } from "./NoteCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const AT = new Date("2026-10-02T05:30:00Z");
const GAP = "No note yet today. The next one is written at 06:30.";
const slot = (view: NoteSlot["view"], over: Partial<NoteSlot> = {}): NoteSlot => ({
  view,
  noteTime: "06:30",
  tokenSet: true,
  ...over,
});
const renderCard = (s: NoteSlot) =>
  render(<NoteCard slot={s} timeZone="Europe/London" locale="en-GB" />);
const card = () => screen.getByRole("region", { name: "A note from Harbour" });

describe("NoteCard", () => {
  it("shows each field as plain text, the picks as links to the board, and when it was written", () => {
    const note = { ...GOOD_NOTE, rest: "All of this can wait until Monday." };
    renderCard(slot({ kind: "note", note, at: AT }));
    const c = within(card());
    expect(c.getByText("Morning, Sam.")).toBeInTheDocument();
    expect(c.getByText("A steady tide, and one win already.")).toBeInTheDocument();
    expect(c.getByText(note.body)).toBeInTheDocument();
    expect(c.getByText("All of this can wait until Monday.")).toBeInTheDocument();
    expect(c.getByRole("link", { name: note.picks[0] ?? "" })).toHaveAttribute("href", "/actions");
    expect(c.getByText("Written 2 Oct, 06:30")).toBeInTheDocument();
    expect(c.getByRole("button", { name: "Write me a fresh one" })).toBeEnabled();
  });

  it("adds no heading: the briefing stays the page's h1", () => {
    renderCard(slot({ kind: "note", note: GOOD_NOTE, at: AT }));
    expect(screen.queryAllByRole("heading")).toEqual([]);
  });

  it("renders text it was given as text, never as markup", () => {
    const note = { ...GOOD_NOTE, headline: "<b>bold</b> <img src=x onerror=alert(1)>" };
    const { container } = renderCard(slot({ kind: "note", note, at: AT }));
    expect(screen.getByText("<b>bold</b> <img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("b, img")).toBeNull();
  });

  it("marks a celebrating note, for the wave's one ripple, and no other note", () => {
    renderCard(slot({ kind: "note", note: GOOD_NOTE, at: AT }));
    expect(card()).toHaveAttribute("data-mood", "celebrate");
  });

  it("does not mark a steady note, a gap or a sample", () => {
    for (const view of [
      { kind: "note" as const, note: { ...GOOD_NOTE, mood: "steady" as const }, at: AT },
      { kind: "gap" as const, line: GAP },
      { kind: "sample" as const, note: SAMPLE_NOTE },
    ]) {
      const { unmount } = renderCard(slot(view));
      expect(card()).not.toHaveAttribute("data-mood");
      unmount();
    }
  });

  it("shows the quiet gap line and the button when there is no note", () => {
    renderCard(slot({ kind: "gap", line: GAP }));
    expect(within(card()).getByText(GAP)).toBeInTheDocument();
    expect(
      within(card()).getByRole("button", { name: "Write me a fresh one" }),
    ).toBeInTheDocument();
  });

  it("says plainly when it could not read the note, and still offers the button", () => {
    renderCard(
      slot({
        kind: "unavailable",
        line: "Harbour couldn't read today's note. The briefing below is still up to date.",
      }),
    );
    expect(within(card()).getByText(/couldn't read today's note/)).toBeInTheDocument();
    expect(
      within(card()).getByRole("button", { name: "Write me a fresh one" }),
    ).toBeInTheDocument();
  });

  it("labels the sample note as a sample and offers no button", () => {
    renderCard(slot({ kind: "sample", note: SAMPLE_NOTE }));
    expect(within(card()).getByText("Sample note")).toBeInTheDocument();
    expect(within(card()).getByText(SAMPLE_NOTE.headline)).toBeInTheDocument();
    expect(within(card()).queryByRole("button")).toBeNull();
  });
});
