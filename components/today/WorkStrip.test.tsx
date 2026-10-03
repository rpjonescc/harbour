// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { EXAMPLE_STRIPS, NORMAL_STRIP } from "@/components/design/board-example-data";
import { COLUMN_COPY, STRIP_TEXT } from "@/lib/explain/board";
import { WorkStrip } from "./WorkStrip";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const [, busy, clear] = EXAMPLE_STRIPS.map((e) => e.strip);

describe("WorkStrip", () => {
  it("shows a link tile per column to the board, named with its count", () => {
    render(<WorkStrip strip={NORMAL_STRIP} />);
    const tiles = NORMAL_STRIP.tiles;
    expect(tiles).toHaveLength(6);
    for (const tile of tiles) {
      const link = screen.getByRole("link", {
        name: STRIP_TEXT.columnTile(tile.column, tile.count),
      });
      expect(link).toHaveAttribute("href", `/actions?view=board#column-${tile.column}`);
      expect(link).toHaveTextContent(COLUMN_COPY[tile.column].name);
    }
  });

  it("puts a text label on every flow bar segment, empty ones included", () => {
    render(<WorkStrip strip={NORMAL_STRIP} />);
    const segments = within(screen.getByTestId("flow-bar")).getAllByRole("listitem", {
      hidden: true,
    });
    expect(segments).toHaveLength(6);
    for (const [i, segment] of segments.entries()) {
      const tile = NORMAL_STRIP.tiles[i];
      expect(segment).toHaveTextContent(tile?.name ?? "missing");
      expect(segment).toHaveTextContent(STRIP_TEXT.cards(tile?.count ?? -1));
    }
    expect(segments[2]).toHaveStyle({ flexGrow: "1" });
    expect(segments[0]).toHaveStyle({ flexGrow: "5" });
  });

  it("gives Stuck and Needs you one line each, linking to the board focus, never a second list", () => {
    render(<WorkStrip strip={busy ?? NORMAL_STRIP} />);
    expect(screen.getByText("3 jobs have stood still for too long.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: STRIP_TEXT.stuckLink })).toHaveAttribute(
      "href",
      "/actions?view=board&focus=stuck",
    );
    expect(screen.getByRole("link", { name: STRIP_TEXT.needsLink })).toHaveAttribute(
      "href",
      "/actions?view=board&focus=needs-you",
    );
    expect(screen.getByText("8 jobs on the board are waiting for you.")).toBeInTheDocument();
    // Today's own "Needs you" section lists the items: the strip only counts them.
    expect(screen.queryByRole("heading", { name: "Needs you" })).not.toBeInTheDocument();
    const lines = screen
      .getAllByRole("listitem")
      .filter((li) => li.closest("[data-testid=flow-bar]") === null);
    expect(lines.filter((li) => !li.querySelector("a[href*='#column-']"))).toHaveLength(2);
    expect(screen.getByText(/You moved “Add a FAQ to the setup page” to Queue\./)).toBeVisible();
  });

  it("says so in plain words when nothing is stuck, needs you or moved", () => {
    render(<WorkStrip strip={clear ?? NORMAL_STRIP} />);
    expect(screen.getByText("Nothing is stuck.")).toBeVisible();
    expect(screen.getByText("Nothing on the board needs you.")).toBeVisible();
    expect(screen.getByText("Nothing has moved today.")).toBeVisible();
    expect(screen.getByText(STRIP_TEXT.nothingYet)).toBeVisible();
    expect(screen.queryByTestId("flow-bar")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: STRIP_TEXT.stuckLink })).not.toBeInTheDocument();
  });

  it("never shows a bare zero", () => {
    const { container } = render(<WorkStrip strip={clear ?? NORMAL_STRIP} />);
    expect(container.textContent).not.toMatch(/(^|\s)0(\s|$)/);
  });
});
