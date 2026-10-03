// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import {
  FEED_EXAMPLES,
  FINISHED_ITEMS,
  RUNNING_ITEMS,
} from "@/components/design/tower-feed-example-data";
import { NOTHING_RAN, TILE_FAILED } from "@/lib/explain/tower";
import { textOutsideDetails } from "@/tests/helpers/plain-text";
import { ActivityFeed } from "./ActivityFeed";

const [busy, idle, quiet] = FEED_EXAMPLES.map((e) => e.result);
const listUnder = (name: string) => {
  const heading = screen.getByRole("heading", { level: 3, name });
  const list = heading.nextElementSibling;
  if (!(list instanceof HTMLElement)) throw new Error(`no list under ${name}`);
  return list;
};

describe("ActivityFeed", () => {
  it("shows what runs now with a working light and when it started", () => {
    if (!busy) throw new Error("missing example");
    render(<ActivityFeed result={busy} />);
    const section = screen.getByRole("region", { name: "What's happening" });
    expect(section).toHaveAttribute("id", "tower-activity");
    const rows = within(listUnder("Running now")).getAllByRole("listitem");
    expect(rows).toHaveLength(RUNNING_ITEMS.length);
    for (const row of rows) expect(row.querySelector("svg")).toHaveAttribute("data-tone", "busy");
    expect(rows[0]).toHaveTextContent("Checking Acme Docs.");
    expect(rows[0]).toHaveTextContent("4 min ago");
  });

  it("lists finished items wins first, failures last, each a link, with the rest on Agents", () => {
    if (!busy) throw new Error("missing example");
    render(<ActivityFeed result={busy} />);
    const rows = within(listUnder("Finished")).getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByRole("link").textContent)).toEqual(
      FINISHED_ITEMS.map((i) => i.sentence),
    );
    expect(rows[0]).toHaveTextContent("win");
    expect(rows[4]?.querySelector("svg")).toHaveAttribute("data-tone", "watch");
    expect(screen.getByRole("link", { name: "3 more on the Agents page" })).toHaveAttribute(
      "href",
      "/agents",
    );
  });

  it("says 'new' in words and tints only items under five minutes old", () => {
    if (!busy) throw new Error("missing example");
    render(<ActivityFeed result={busy} />);
    const [fresh, older] = within(listUnder("Finished")).getAllByRole("listitem");
    expect(fresh).toHaveTextContent("new");
    expect(fresh).toHaveClass("tower-new");
    expect(older).not.toHaveTextContent("new");
    expect(older).not.toHaveClass("tower-new");
  });

  it("keeps the runs' technical names under Technical details, off the feed's face", () => {
    if (!busy) throw new Error("missing example");
    const { container } = render(<ActivityFeed result={busy} />);
    const details = container.querySelector("details");
    expect(details).toHaveTextContent("Weekly report: 2026-W40 (weekly-analyst)");
    expect(textOutsideDetails(container)).not.toMatch(/weekly-analyst|\(scan\)|Check \(/);
  });

  it("says when nothing is running but things finished", () => {
    if (!idle) throw new Error("missing example");
    render(<ActivityFeed result={idle} />);
    expect(screen.getByText("Nothing is running right now.")).toBeVisible();
    expect(screen.queryByRole("link", { name: /more on the Agents page/ })).toBeNull();
  });

  it("says a quiet day calmly, with the next run, and no empty lists", () => {
    if (!quiet) throw new Error("missing example");
    render(<ActivityFeed result={quiet} />);
    expect(screen.getByText(NOTHING_RAN("06:00"))).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("caps the running group at five and counts the rest on the Agents page", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...RUNNING_ITEMS[1], id: `r${i}` }));
    render(
      <ActivityFeed
        result={{
          ok: true,
          data: { running: many as typeof RUNNING_ITEMS, finished: [], more: 0, empty: null },
        }}
      />,
    );
    expect(within(listUnder("Running now")).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "2 more on the Agents page" })).toBeVisible();
  });

  it("says it couldn't read the feed when its loader failed", () => {
    render(<ActivityFeed result={{ ok: false, detail: "boom" }} />);
    expect(screen.getByText(TILE_FAILED)).toBeVisible();
  });
});
