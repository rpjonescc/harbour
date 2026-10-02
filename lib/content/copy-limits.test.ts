import { PIECES } from "@/tests/helpers/content";
import type { PLATFORMS } from "./ids";
import { copyParts, X_SEPARATOR } from "./render";
import { contentSchemas, weightedLength } from "./shapes";

const tag31 = `#${"a".repeat(30)}`;
const accepted = (platform: (typeof PLATFORMS)[number], value: unknown) =>
  contentSchemas[platform].safeParse(value).success;

describe("a piece that is accepted can be copied within its platform's limit", () => {
  it("rejects an X post that fits alone but not with the hashtag copied after it", () => {
    expect(accepted("x", { posts: ["a".repeat(280)], hashtags: [] })).toBe(true);
    expect(accepted("x", { posts: ["a".repeat(280)], hashtags: [tag31] })).toBe(false);
    expect(accepted("x", { posts: ["a".repeat(248)], hashtags: [tag31] })).toBe(true);
    expect(accepted("x", { posts: ["a".repeat(249)], hashtags: [tag31] })).toBe(false);
    expect(accepted("x", { posts: ["a".repeat(200)], hashtags: ["#docs"] })).toBe(true);
  });

  it.each([
    ["linkedin", 3000, 3000 - 14],
    ["facebook", 1500, 1500 - 14],
  ] as const)("rejects %s text plus hashtags over %i characters", (platform, cap, fits) => {
    const base = PIECES[platform];
    const tags = ["#docs", "#guide"];
    expect(accepted(platform, { ...base, text: "a".repeat(fits), hashtags: tags })).toBe(true);
    expect(accepted(platform, { ...base, text: "a".repeat(cap), hashtags: tags })).toBe(false);
    expect(accepted(platform, { ...base, text: "a".repeat(cap), hashtags: [] })).toBe(true);
  });

  it("rejects an Instagram caption plus hashtags over 2200 characters", () => {
    const tags = ["#docs", "#guide", "#tips"];
    expect(
      accepted("instagram", { ...PIECES.instagram, caption: "a".repeat(2200), hashtags: tags }),
    ).toBe(false);
    expect(
      accepted("instagram", { ...PIECES.instagram, caption: "a".repeat(2100), hashtags: tags }),
    ).toBe(true);
  });

  it("never copies more than the limit, for every accepted case", () => {
    const cases: [(typeof PLATFORMS)[number], Record<string, unknown>][] = [];
    for (const n of [0, 100, 247, 260, 270, 275, 280, 300]) {
      for (const hashtags of [[], ["#docs"], [tag31]])
        cases.push(["x", { posts: ["a".repeat(n) || "a"], hashtags }]);
    }
    for (const n of [10, 2900, 2985, 2990, 3000]) {
      for (const hashtags of [[], ["#docs"], ["#docs", "#guide", "#tips"]]) {
        cases.push(["linkedin", { text: "a".repeat(n), hashtags }]);
        cases.push(["facebook", { text: "a".repeat(n / 2), hashtags: hashtags.slice(0, 2) }]);
        cases.push([
          "instagram",
          {
            ...PIECES.instagram,
            caption: "a".repeat(n * 0.7),
            hashtags: hashtags.length
              ? [...hashtags, "#a1", "#b2", "#c3"].slice(0, 8)
              : PIECES.instagram.hashtags,
          },
        ]);
      }
    }
    const caps = { x: 280, linkedin: 3000, facebook: 1500, instagram: 2200 } as const;
    let kept = 0;
    for (const [platform, value] of cases) {
      const parsed = contentSchemas[platform].safeParse(value);
      if (!parsed.success) continue;
      kept += 1;
      const copied = copyParts(platform, parsed.data).map((part) => part.text);
      if (platform === "x") {
        for (const text of copied) expect(weightedLength(text)).toBeLessThanOrEqual(caps.x);
      } else if (platform === "instagram") {
        // Caption and hashtags are posted together, so they share the cap.
        expect(copied.filter(Boolean).join("\n\n").length).toBeLessThanOrEqual(caps.instagram);
      } else {
        const cap = caps[platform as "linkedin" | "facebook"];
        for (const text of copied) expect(text.length).toBeLessThanOrEqual(cap);
      }
    }
    expect(kept).toBeGreaterThan(20);
  });

  it("rejects an X post that holds the line used to split posts, and a hashtag typed into the text", () => {
    expect(accepted("x", { posts: [`one ${X_SEPARATOR} two`], hashtags: [] })).toBe(false);
    expect(accepted("x", { posts: ["Ship #docs today"], hashtags: [] })).toBe(false);
    expect(accepted("linkedin", { text: "Ship #docs today", hashtags: [] })).toBe(false);
    expect(accepted("facebook", { text: "Ship #docs today", hashtags: [] })).toBe(false);
    expect(accepted("instagram", { ...PIECES.instagram, caption: "Ship #docs today" })).toBe(false);
    expect(
      accepted("linkedin", {
        text: "Issue #42 and a link https://docs.example.com/#top",
        hashtags: [],
      }),
    ).toBe(true);
  });
});
