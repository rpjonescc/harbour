// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { NORMAL_STRIP } from "@/components/design/board-example-data";
import { EXAMPLE_NOTES } from "@/components/design/note-example-data";
import {
  BLOG_CARD,
  CALM_LIGHTS,
  DOCS_CARD,
  EXAMPLE_BRIEFING,
  NEED_ITEMS,
} from "@/components/design/tower-example-data";
import {
  BUSY_WEEK,
  FINISHED_ITEMS,
  RUNNING_ITEMS,
} from "@/components/design/tower-feed-example-data";
import { NOTE_FAILED, SECTION_TITLES, TILE_FAILED } from "@/lib/explain/tower";
import type { Tower } from "@/lib/tower/load";
import { TowerView } from "./TowerView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const NOW = new Date("2026-10-02T08:42:00Z");
const RAW_ERROR = "SqliteError: database is locked";
const tower = (over: Partial<Tower> = {}): Tower => ({
  headline: "Everything is running.",
  subline: "5 things need you.",
  systems: { ok: true, data: { lights: CALM_LIGHTS, worst: null } },
  needs: { ok: true, data: { items: NEED_ITEMS, more: 0, moreHref: null } },
  work: { ok: true, data: NORMAL_STRIP },
  runways: { ok: true, data: [DOCS_CARD, BLOG_CARD] },
  briefing: EXAMPLE_BRIEFING,
  isSample: false,
  activity: {
    ok: true,
    data: { running: RUNNING_ITEMS, finished: FINISHED_ITEMS, more: 0, empty: null, busy: true },
  },
  wins: { ok: true, data: BUSY_WEEK },
  note: { ok: true, data: EXAMPLE_NOTES[0]?.slot ?? null },
  active: false,
  ...over,
});
const renderTower = (t = tower()) =>
  render(<TowerView tower={t} now={NOW} timeZone="Europe/London" locale="en-GB" />);

/** The page's text as first painted: closed Technical details hold the raw errors. */
function paintedText(container: HTMLElement): string {
  const copy = container.cloneNode(true);
  if (!(copy instanceof HTMLElement)) throw new Error("not an element");
  for (const details of copy.querySelectorAll("details")) details.remove();
  return copy.textContent ?? "";
}

describe("TowerView", () => {
  it("has one h1, the headline, and six h2s in reading order", () => {
    renderTower();
    const [h1, ...others] = screen.getAllByRole("heading", { level: 1 });
    expect(others).toHaveLength(0);
    expect(h1).toHaveTextContent("Everything is running. 5 things need you.");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
      Object.values(SECTION_TITLES),
    );
  });

  it("puts the sections in the DOM in the order the owner asks", () => {
    renderTower();
    const regions = Object.values(SECTION_TITLES).map((name) =>
      screen.getByRole("region", { name }),
    );
    const note = screen.getByRole("region", { name: "A note from Harbour" });
    const order = [regions[0], regions[1], note, ...regions.slice(2)];
    for (const [i, el] of order.entries()) {
      const next = order[i + 1];
      if (el && next) {
        expect(el.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    }
  });

  it("jumps to every section from the header", () => {
    renderTower();
    const jump = screen.getByRole("navigation", { name: "On this page" });
    for (const link of within(jump).getAllByRole("link")) {
      const target = document.getElementById(link.getAttribute("href")?.slice(1) ?? "");
      expect(target).not.toBeNull();
      expect(target).toHaveTextContent(link.textContent ?? "");
    }
    expect(within(jump).getAllByRole("link")).toHaveLength(6);
  });

  it("puts the date and the time it was drawn under the headline", () => {
    renderTower();
    expect(screen.getByText("Friday 2 October · updated 09:42")).toBeVisible();
  });

  it("keeps only the sub-line live", () => {
    const { container } = renderTower();
    const live = container.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0]).toHaveAttribute("aria-live", "polite");
    expect(live[0]?.textContent).toBe("5 things need you.");
  });

  it("puts the note beside Needs you, and leaves it out under the quiet personality", () => {
    const { unmount } = renderTower();
    const needs = screen.getByRole("region", { name: "Needs you" });
    const card = screen.getByRole("region", { name: "A note from Harbour" });
    expect(needs.parentElement).toBe(card.parentElement);
    unmount();
    renderTower(tower({ note: { ok: true, data: null } }));
    expect(screen.queryByRole("region", { name: "A note from Harbour" })).toBeNull();
    expect(screen.getByRole("region", { name: "Needs you" })).toBeInTheDocument();
  });

  it("shows the Board's work strip unchanged", () => {
    renderTower();
    const work = screen.getByRole("region", { name: "Where the work is" });
    expect(work.parentElement).toHaveAttribute("id", "tower-work");
    expect(within(work).getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("leads Your products with the briefing and flags the sample", () => {
    renderTower(tower({ isSample: true }));
    const products = screen.getByRole("region", { name: "Your products" });
    expect(products).toHaveTextContent(EXAMPLE_BRIEFING.sentence);
    expect(within(products).getByRole("note")).toHaveTextContent(/Sample data/);
    expect(within(products).getByText("Sample", { exact: true })).toBeInTheDocument();
  });

  it("keeps every other tile when one fails, with no raw error in the first paint", () => {
    const failed = { ok: false as const, detail: RAW_ERROR };
    const { container } = renderTower(
      tower({ systems: failed, work: failed, runways: failed, briefing: null, wins: failed }),
    );
    expect(screen.getAllByText(TILE_FAILED)).toHaveLength(4);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(6);
    expect(screen.getByRole("region", { name: "Needs you" })).toHaveTextContent(
      NEED_ITEMS[0]?.sentence ?? "",
    );
    expect(screen.getByRole("region", { name: "What's happening" })).toBeInTheDocument();
    for (const raw of screen.getAllByText(RAW_ERROR)) expect(raw).not.toBeVisible();
    expect(paintedText(container)).not.toMatch(/Error|database is locked/);
  });

  it("says in a plain sentence when the daily note can't be read, and keeps Needs you", () => {
    const { container } = renderTower(tower({ note: { ok: false, detail: RAW_ERROR } }));
    expect(screen.getByText(NOTE_FAILED)).toBeVisible();
    expect(screen.queryByRole("region", { name: "A note from Harbour" })).toBeNull();
    expect(screen.getByRole("region", { name: "Needs you" })).toBeInTheDocument();
    expect(paintedText(container)).not.toMatch(/database is locked/);
  });

  it("speaks plainly: no codes outside Technical details", () => {
    const { container } = renderTower();
    const text = paintedText(container);
    expect(text).not.toMatch(/\b(?:SEO|GEO|AEO)\b/);
    expect(text).not.toMatch(/HARBOUR_[A-Z_]+/);
    expect(text).not.toMatch(/\b(?:seo|geo|aeo)\.[a-zA-Z]/);
  });

  it("reaches every link and button from the keyboard", () => {
    const { container } = renderTower();
    for (const el of container.querySelectorAll("a, button")) {
      expect(el.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});
