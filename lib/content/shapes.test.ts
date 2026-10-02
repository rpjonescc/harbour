import { PIECES, tags, words } from "@/tests/helpers/content";
import { PLATFORMS } from "./ids";
import { contentSchemas, weightedLength, wordCount } from "./shapes";

describe("platform shapes", () => {
  it.each(PLATFORMS)("accepts a valid %s piece and rejects an unknown key", (platform) => {
    expect(contentSchemas[platform].safeParse(PIECES[platform]).success).toBe(true);
    expect(contentSchemas[platform].safeParse({ ...PIECES[platform], extra: 1 }).success).toBe(
      false,
    );
  });

  it.each([
    ["linkedin text over 3000", "linkedin", { text: "a".repeat(3001), hashtags: [] }],
    ["linkedin 4 hashtags", "linkedin", { text: "a", hashtags: tags(4) }],
    ["x with 6 posts", "x", { posts: Array(6).fill("a"), hashtags: [] }],
    ["x post over 280 weighted", "x", { posts: ["a".repeat(281)], hashtags: [] }],
    ["x 2 hashtags", "x", { posts: ["a"], hashtags: tags(2) }],
    ["instagram 2 hashtags", "instagram", { ...PIECES.instagram, hashtags: tags(2) }],
    ["instagram 9 hashtags", "instagram", { ...PIECES.instagram, hashtags: tags(9) }],
    [
      "instagram 2 carousel slides",
      "instagram",
      { ...PIECES.instagram, carousel: { slides: Array(2).fill({ headline: "h", body: "b" }) } },
    ],
    ["facebook text over 1500", "facebook", { text: "a".repeat(1501), hashtags: [] }],
    ["blog answer of 39 words", "blog", { ...PIECES.blog, answer: words(39) }],
    ["blog body of 599 words", "blog", { ...PIECES.blog, body: words(599) }],
    ["blog body of 1601 words", "blog", { ...PIECES.blog, body: words(1601) }],
    ["blog metaDescription over 155", "blog", { ...PIECES.blog, metaDescription: "a".repeat(156) }],
    ["blog slug with capitals", "blog", { ...PIECES.blog, slug: "Five-Minutes" }],
    ["website body of 39 words", "website", { ...PIECES.website, body: words(39) }],
    ["website 4 bullets", "website", { ...PIECES.website, bullets: ["a", "b", "c", "d"] }],
    ["website 5-word label", "website", { ...PIECES.website, ctaLabel: "one two three four five" }],
    ["a hashtag with a space", "linkedin", { text: "a", hashtags: ["#two words"] }],
  ] as const)("rejects %s", (_label, platform, value) => {
    expect(contentSchemas[platform].safeParse(value).success).toBe(false);
  });
});

describe("lengths", () => {
  it("counts a link as 23 characters whatever its length", () => {
    expect(weightedLength("see https://docs.example.com/a/very/long/path/that/goes/on")).toBe(
      4 + 23,
    );
    expect(weightedLength("no link")).toBe(7);
  });
  it("counts emoji and other characters outside X's light ranges as two", () => {
    expect(weightedLength("🙂🙂")).toBe(4);
    expect(weightedLength("🙂".repeat(150))).toBe(300);
    expect(weightedLength("日本")).toBe(4);
    expect(weightedLength("café – “ok”")).toBe(Array.from("café – “ok”").length);
  });
  it("counts words by spaces", () => {
    expect(wordCount("  one two\nthree ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
