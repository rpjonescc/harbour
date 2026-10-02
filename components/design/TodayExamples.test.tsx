// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { getProducts } from "@/lib/products/catalog";
import { EXAMPLE_NOTES } from "./note-example-data";
import { TodayExamples } from "./TodayExamples";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("TodayExamples", () => {
  it("shows the briefing, the verdict table and a card per who's on it, under the page's heading", () => {
    const [product] = getProducts();
    if (!product) throw new Error("the example config lists products");
    render(<TodayExamples product={product} />);
    expect(screen.queryAllByRole("heading", { level: 1 })).toEqual([]);
    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([]);
    expect(
      screen.getAllByRole("heading", { level: 3, name: /^Your site is in fair shape\./ }),
    ).toHaveLength(2);
    expect(screen.getAllByRole("region", { name: "A note from Harbour" })).toHaveLength(
      EXAMPLE_NOTES.length,
    );
    expect(EXAMPLE_NOTES).toHaveLength(12);
    expect(screen.getByText("Sample note")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Scores by product" })).toBeInTheDocument();
    for (const phrase of [
      "Claude is on it",
      "Pull request waiting for your OK",
      "Waiting for you",
    ]) {
      expect(screen.getAllByText(phrase).length).toBeGreaterThan(0);
    }
  });

  describe("the note examples", () => {
    const [product] = getProducts();
    const example = (label: string) => {
      if (!product) throw new Error("the example config lists products");
      render(<TodayExamples product={product} />);
      return within(screen.getByRole("group", { name: label }));
    };

    it("show the attention mood, the unavailable view and the sample", () => {
      expect(
        example("Note · something needs a look (mood attention)").getByText(/didn't finish/),
      ).toBeTruthy();
      expect(EXAMPLE_NOTES.map((e) => e.slot.view.kind)).toEqual(
        expect.arrayContaining(["note", "gap", "unavailable", "sample"]),
      );
      expect(
        EXAMPLE_NOTES.some(
          (e) => e.slot.view.kind === "note" && e.slot.view.note.mood === "attention",
        ),
      ).toBe(true);
    });

    it("say the note could not be read", () => {
      expect(
        example("Note · the note could not be read").getByText(/couldn't read today's note/),
      ).toBeInTheDocument();
    });

    it("show the button off, with the reason, when there is no Claude token", () => {
      const card = example("Button · no Claude token, so it is switched off");
      expect(card.getByRole("button", { name: "Write me a fresh one" })).toBeDisabled();
      expect(card.getByRole("status")).toHaveTextContent("Notes need Claude to be connected.");
    });

    it.each([
      ["Button · waiting for a fresh note", "Writing a fresh one now.", false],
      ["Button · asked too many times today", "That's plenty of notes for one day.", true],
      ["Button · could not start a note", "Harbour couldn't start a note just now.", true],
      ["Button · the note did not pass the checks", "That note didn't pass Harbour's checks", true],
    ])("show the %s", (label, text, enabled) => {
      const card = example(label);
      expect(card.getByRole("status")).toHaveTextContent(text);
      const button = card.getByRole("button", { name: "Write me a fresh one" });
      if (enabled) expect(button).toBeEnabled();
      else expect(button).toBeDisabled();
    });

    it("say there is no schedule, where none runs", () => {
      expect(
        example("Note · no note yet today, and no schedule running").getByText(
          "No note yet today.",
        ),
      ).toBeInTheDocument();
    });
  });
});
