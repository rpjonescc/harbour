import { ago, DAY, HOUR, job, PRODUCTS } from "@/tests/helpers/tower";
import { needsYou } from "./needs";
import type { NeedsFacts } from "./needs-data";
import type { Light } from "./system";

const quiet: NeedsFacts = {
  suggested: { count: 0, oldest: null },
  content: { needsYou: 0, ready: 0 },
  approvals: [],
  failedRuns: [],
  products: PRODUCTS,
};
const fine: Light[] = [
  { id: "worker", tone: "ok", sentence: "The worker is running.", href: "/x" },
];
const board = { count: 0, href: "/actions?view=board&focus=needs-you", lines: [] };
const facts = (over: Partial<NeedsFacts>): NeedsFacts => ({ ...quiet, ...over });

describe("needsYou", () => {
  it("has no items when nothing needs the owner", () => {
    expect(needsYou(quiet, fine, board)).toEqual({ items: [], more: 0, moreHref: null });
  });

  it("lists everything in priority order, each with one link named by its item", () => {
    const failed = job({
      id: 7,
      kind: "content-ideas",
      params: { productId: "acme-docs" },
      status: "failed",
      finishedAt: ago(HOUR),
    });
    const act: Light = {
      id: "worker",
      tone: "act",
      sentence: "The worker isn't running, so checks, backups and agents are waiting.",
      href: "https://example.com/deploy",
    };
    const all = facts({
      suggested: { count: 3, oldest: ago(2 * DAY) },
      content: { needsYou: 1, ready: 2 },
      approvals: [{ productId: "acme-blog", productName: "Acme Blog", count: 4 }],
      failedRuns: [failed],
    });
    const { items, more, moreHref } = needsYou(all, [...fine, act], { ...board, count: 5 });
    expect(items.map((i) => i.kind)).toEqual(["system", "review", "ideas", "content", "content"]);
    expect(more).toBe(2);
    // An approval and a run wait in two places, so "2 more" names no single page.
    expect(moreHref).toBeNull();
    expect(items[0]).toEqual({
      kind: "system",
      sentence: act.sentence,
      button: {
        label: "How to fix",
        href: "https://example.com/deploy",
        name: "How to fix: The worker isn't running, so checks, backups and agents are waiting",
      },
      since: null,
    });
    // The Board's 5 include the 3 new ideas, which are their own item.
    expect(items[1]?.sentence).toBe("2 cards on the Board are waiting for you.");
    expect(items[1]?.button).toMatchObject({ label: "Review", href: board.href });
    expect(items[2]).toMatchObject({
      sentence: "3 new ideas to decide.",
      button: {
        label: "Decide",
        href: "/actions?view=board",
        name: "Decide: 3 new ideas to decide",
      },
      since: ago(2 * DAY),
    });
    expect(items.slice(3).map((i) => i.sentence)).toEqual([
      "1 draft needs you before it can go out.",
      "2 drafts are ready for you.",
    ]);
  });

  it("puts approvals and failed runs last, oldest run first", () => {
    const older = job({
      id: 3,
      kind: "discovery",
      params: { productId: "acme-blog" },
      status: "failed",
      finishedAt: ago(5 * HOUR),
    });
    const newer = job({
      id: 4,
      kind: "weekly-analyst",
      params: { week: "2026-W40" },
      status: "failed",
      finishedAt: ago(HOUR),
    });
    const { items } = needsYou(
      facts({
        approvals: [{ productId: "acme-docs", productName: "Acme Docs", count: 1 }],
        failedRuns: [newer, older],
      }),
      fine,
      board,
    );
    expect(items.map((i) => [i.kind, i.sentence, i.button.href])).toEqual([
      [
        "approvals",
        "1 research target for Acme Docs is waiting for your OK.",
        "/settings/products/acme-docs",
      ],
      ["run", "A run didn't finish: Find ideas: Acme Blog.", "/agents/3"],
      ["run", "A run didn't finish: Weekly report: 2026-W40.", "/agents/4"],
    ]);
    expect(items[1]?.button.label).toBe("See what happened");
    expect(items[1]?.since).toEqual(ago(5 * HOUR));
  });

  it("leaves reviews out when the Board isn't there, and content out when content is off", () => {
    const { items } = needsYou(facts({ content: null }), fine, null);
    expect(items).toEqual([]);
    const ideas = needsYou(facts({ suggested: { count: 1, oldest: null } }), fine, null);
    expect(ideas.items.map((i) => i.sentence)).toEqual(["1 new idea to decide."]);
  });

  it("never lists a light that is only worth a look", () => {
    const watch: Light = { id: "spend", tone: "watch", sentence: "85% used.", href: "/settings" };
    expect(needsYou(quiet, [watch], board).items).toEqual([]);
  });

  it("caps at five and counts the rest", () => {
    const approvals = Array.from({ length: 8 }, (_, i) => ({
      productId: `p${i}`,
      productName: `Site ${i}`,
      count: 1,
    }));
    const { items, more } = needsYou(facts({ approvals }), fine, board);
    expect(items).toHaveLength(5);
    expect(more).toBe(3);
  });

  describe("where the hidden ones wait", () => {
    const acts: Light[] = (["worker", "schedules", "checks", "backups", "sources"] as const).map(
      (id) => ({ id, tone: "act", sentence: `${id} needs you.`, href: "/settings" }),
    );
    const run = (id: number) =>
      job({ id, kind: "discovery", params: { productId: "acme-docs" }, status: "failed" });

    it("links to the Board's Needs you when every hidden item is on the Board", () => {
      const hidden = facts({ suggested: { count: 2, oldest: null } });
      const result = needsYou(hidden, acts, { ...board, count: 4 });
      expect(result.items.every((i) => i.kind === "system")).toBe(true);
      expect(result).toMatchObject({ more: 2, moreHref: "/actions?view=board&focus=needs-you" });
    });

    it("links to Agents when every hidden item is a run, and to Content for content", () => {
      expect(needsYou(facts({ failedRuns: [run(1), run(2)] }), acts, board).moreHref).toBe(
        "/agents",
      );
      expect(needsYou(facts({ content: { needsYou: 1, ready: 1 } }), acts, board).moreHref).toBe(
        "/content",
      );
    });

    it("stays plain text when the hidden items wait in different places", () => {
      const approvals = Array.from({ length: 8 }, (_, i) => ({
        productId: `p${i}`,
        productName: `Site ${i}`,
        count: 1,
      }));
      expect(needsYou(facts({ approvals }), fine, board).moreHref).toBeNull();
    });
  });
});
