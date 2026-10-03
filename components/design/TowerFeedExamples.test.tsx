// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { NOTHING_RAN, QUIET_WEEK, TILE_FAILED } from "@/lib/explain/tower";
import { TowerFeedExamples } from "./TowerFeedExamples";

describe("TowerFeedExamples", () => {
  it("shows every feed and wins state from demo data, with unique anchors", () => {
    const { container } = render(<TowerFeedExamples />);
    expect(screen.getAllByRole("region", { name: "What's happening" })).toHaveLength(4);
    expect(screen.getAllByRole("region", { name: "Wins this week" })).toHaveLength(2);
    expect(screen.getByText(NOTHING_RAN("06:00"))).toBeVisible();
    expect(screen.getByText(QUIET_WEEK)).toBeVisible();
    expect(screen.getByText(TILE_FAILED)).toBeVisible();
    expect(screen.getAllByRole("table", { name: "Cards finished each day" })).toHaveLength(2);
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
