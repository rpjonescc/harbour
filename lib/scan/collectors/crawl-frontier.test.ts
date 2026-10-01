import { Frontier } from "./crawl-frontier";

const origin = "https://docs.example.com";

describe("Frontier", () => {
  it("queues same-origin URLs once, in order, without fragments", () => {
    const frontier = new Frontier(origin);
    frontier.add(`${origin}/a#top`);
    frontier.add("/b", `${origin}/a`);
    frontier.add(`${origin}/a`);
    frontier.add("https://www.example.org/x");
    frontier.add("mailto:owner@example.com");
    expect([frontier.next(), frontier.next(), frontier.next()]).toEqual([
      `${origin}/a`,
      `${origin}/b`,
      undefined,
    ]);
    expect(frontier.hasPending()).toBe(false);
  });

  it("does not queue a URL it already visited", () => {
    const frontier = new Frontier(origin);
    frontier.markKnown(`${origin}/`);
    frontier.add(`${origin}/`);
    expect(frontier.next()).toBeUndefined();
  });

  it("remembers up to three referrers per URL", () => {
    const frontier = new Frontier(origin);
    for (const from of ["/1", "/2", "/3", "/4", "/2"]) frontier.add("/x", `${origin}${from}`);
    expect(frontier.referrersOf(`${origin}/x`)).toEqual([
      `${origin}/1`,
      `${origin}/2`,
      `${origin}/3`,
    ]);
  });

  it("bounds how many URLs it knows", () => {
    const frontier = new Frontier(origin, 3);
    for (let i = 0; i < 5; i++) frontier.add(`/p${i}`, `${origin}/`);
    const queued = [frontier.next(), frontier.next(), frontier.next(), frontier.next()];
    expect(queued).toEqual([`${origin}/p0`, `${origin}/p1`, `${origin}/p2`, undefined]);
    expect(frontier.referrersOf(`${origin}/p4`)).toEqual([]);
  });
});
