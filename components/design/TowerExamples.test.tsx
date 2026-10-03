// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { NOTHING_NEEDS_YOU, TILE_FAILED } from "@/lib/explain/tower";
import { TowerExamples } from "./TowerExamples";

describe("TowerExamples", () => {
  it("shows every systems, needs-you and runway state from demo data, with unique anchors", () => {
    const { container } = render(<TowerExamples />);
    expect(screen.getAllByRole("region", { name: "Systems" })).toHaveLength(3);
    expect(screen.getAllByRole("region", { name: "Needs you" })).toHaveLength(4);
    expect(screen.getAllByRole("region", { name: "Your products" })).toHaveLength(2);
    expect(
      screen.getByText("Nothing needs a look. Working now: Checks. Switched off: Backups."),
    ).toBeVisible();
    expect(screen.getByText(NOTHING_NEEDS_YOU)).toBeVisible();
    // "N more" is a link only when every hidden item waits in one place.
    expect(screen.getByRole("link", { name: "See the other 3" })).toHaveAttribute(
      "href",
      "/actions?view=board&focus=needs-you",
    );
    expect(screen.getAllByText(TILE_FAILED)).toHaveLength(2);
    expect(screen.getByRole("note")).toHaveTextContent(/Sample data/);
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });
});
