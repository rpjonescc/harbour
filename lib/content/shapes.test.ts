import { PLATFORMS } from "./ids";
import { contentSchemas, weightedLength, wordCount } from "./shapes";

const words = (n: number, word = "word") => Array.from({ length: n }, () => word).join(" ");
const tags = (n: number) => Array.from({ length: n }, (_, i) => `#tag${i}`);

const VALID = {
  linkedin: { text: "Docs that ship in five minutes.", hashtags: ["#docs"] },
  x: { posts: ["Ship docs in five minutes."], hashtags: [] },
  instagram: {
    caption: "Five minutes to a first deploy.",
    hashtags: tags(3),
    visual: {
      concept: "A stopwatch beside a laptop",
      onImageText: "5 minutes",
      altText: "A stopwatch",
    },
  },
  facebook: { text: "Our getting-started guide, rebuilt.", hashtags: [] },
  blog: {
    title: "Five minutes to a first deploy",
    metaTitle: "Deploy docs in five minutes",
    metaDescription: "The shortest path from sign-up to a live docs page.",
    slug: "five-minutes-to-a-first-deploy",
    answer: words(45),
    body: words(700),
  },
  website: {
    heading: "Publish docs today",
    body: words(60),
    bullets: ["One page"],
    ctaLabel: "Try it free",
  },
} as const;

describe("platform shapes", () => {
  it.each(PLATFORMS)("accepts a valid %s piece and rejects an unknown key", (platform) => {
    expect(contentSchemas[platform].safeParse(VALID[platform]).success).toBe(true);
    expect(contentSchemas[platform].safeParse({ ...VALID[platform], extra: 1 }).success).toBe(
      false,
    );
  });

  it.each([
    ["linkedin text over 3000", "linkedin", { text: "a".repeat(3001), hashtags: [] }],
    ["linkedin 4 hashtags", "linkedin", { text: "a", hashtags: tags(4) }],
    ["x with 6 posts", "x", { posts: Array(6).fill("a"), hashtags: [] }],
    ["x post over 280 weighted", "x", { posts: ["a".repeat(281)], hashtags: [] }],
    ["x 2 hashtags", "x", { posts: ["a"], hashtags: tags(2) }],
    ["instagram 2 hashtags", "instagram", { ...VALID.instagram, hashtags: tags(2) }],
    ["instagram 9 hashtags", "instagram", { ...VALID.instagram, hashtags: tags(9) }],
    [
      "instagram 2 carousel slides",
      "instagram",
      { ...VALID.instagram, carousel: { slides: Array(2).fill({ headline: "h", body: "b" }) } },
    ],
    ["facebook text over 1500", "facebook", { text: "a".repeat(1501), hashtags: [] }],
    ["blog answer of 39 words", "blog", { ...VALID.blog, answer: words(39) }],
    ["blog body of 599 words", "blog", { ...VALID.blog, body: words(599) }],
    ["blog body of 1601 words", "blog", { ...VALID.blog, body: words(1601) }],
    ["blog metaDescription over 155", "blog", { ...VALID.blog, metaDescription: "a".repeat(156) }],
    ["blog slug with capitals", "blog", { ...VALID.blog, slug: "Five-Minutes" }],
    ["website body of 39 words", "website", { ...VALID.website, body: words(39) }],
    ["website 4 bullets", "website", { ...VALID.website, bullets: ["a", "b", "c", "d"] }],
    ["website 5-word label", "website", { ...VALID.website, ctaLabel: "one two three four five" }],
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
  it("counts emoji as one character and words by spaces", () => {
    expect(weightedLength("🙂🙂")).toBe(2);
    expect(wordCount("  one two\nthree ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
