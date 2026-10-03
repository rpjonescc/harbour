// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { BUSY_WEEK, QUIET_WEEK_WINS } from "@/components/design/tower-feed-example-data";
import { QUIET_WEEK, TILE_FAILED } from "@/lib/explain/tower";
import { WinsPanel } from "./WinsPanel";

describe("WinsPanel", () => {
  it("lists the week's wins and draws the bars", () => {
    render(<WinsPanel result={{ ok: true, data: BUSY_WEEK }} />);
    const section = screen.getByRole("region", { name: "Wins this week" });
    expect(section).toHaveAttribute("id", "tower-wins");
    const lines = within(section)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(lines).toEqual(BUSY_WEEK.lines);
    expect(screen.queryByText(QUIET_WEEK)).toBeNull();
    expect(screen.getByRole("table", { name: "Cards finished each day" })).toBeInTheDocument();
  });

  it("says a quiet week kindly and still shows the bars", () => {
    render(<WinsPanel result={{ ok: true, data: QUIET_WEEK_WINS }} />);
    expect(screen.getByText(QUIET_WEEK)).toBeVisible();
    expect(screen.getByRole("table", { name: "Cards finished each day" })).toBeInTheDocument();
  });

  it("says it couldn't read the wins when its loader failed", () => {
    render(<WinsPanel result={{ ok: false, detail: "boom" }} />);
    expect(screen.getByText(TILE_FAILED)).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
