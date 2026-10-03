import {
  ideaIdSchema,
  makeIdeaId,
  PLATFORMS,
  pieceId,
  pieceIdSchema,
  productForIdea,
  slugify,
  splitPieceId,
} from "./ids";

describe("slugify", () => {
  it.each([
    ["Five minutes to a first deploy", "five-minutes-to-a-first-deploy"],
    ["  Café: the 'quiet' hour!  ", "cafe-the-quiet-hour"],
    ["!!!", "idea"],
  ])("%j becomes %j", (input, slug) => expect(slugify(input)).toBe(slug));

  it("cuts at the limit without leaving a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(10)} ${"b".repeat(10)}`, 11);
    expect(slug).toBe("aaaaaaaaaa");
  });
});

describe("makeIdeaId", () => {
  it("is productId, compact day and slug, and always a valid id of at most 80 characters", () => {
    const id = makeIdeaId("acme-docs", "2026-10-02", "Five minutes to a first deploy");
    expect(id).toBe("acme-docs-20261002-five-minutes-to-a-first-deploy");
    const long = makeIdeaId("p".repeat(40), "2026-10-02", "word ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(ideaIdSchema.safeParse(long).success).toBe(true);
  });

  it("refuses a day that is not YYYY-MM-DD", () => {
    expect(() => makeIdeaId("acme-docs", "2 Oct 2026", "x")).toThrow(/day/);
    expect(() => makeIdeaId("acme-docs", "2026-02-31", "x")).toThrow(/day/);
  });
});

describe("ids from outside", () => {
  it.each(["", "../etc", "A-B", "a--b", "a/b", "x".repeat(81), "a b"])("ideaId rejects %j", (v) =>
    expect(ideaIdSchema.safeParse(v).success).toBe(false),
  );

  it("splits a piece id for every platform and refuses anything else", () => {
    for (const platform of PLATFORMS) {
      const id = pieceId("acme-docs-20261002-x", platform);
      expect(pieceIdSchema.safeParse(id).success).toBe(true);
      expect(splitPieceId(id)).toEqual({ ideaId: "acme-docs-20261002-x", platform });
    }
    for (const bad of ["acme", "acme.tiktok", "../x.blog", "a.b.blog", ".blog"]) {
      expect(splitPieceId(bad)).toBeNull();
    }
  });
});

describe("productForIdea", () => {
  const products = [{ id: "acme" }, { id: "acme-docs" }];
  it("matches the product by its whole id and the date, so a shorter id never claims a longer one's idea", () => {
    expect(productForIdea(products, "acme-docs-20261002-five-minutes")?.id).toBe("acme-docs");
    expect(productForIdea(products, "acme-20261002-five-minutes")?.id).toBe("acme");
    expect(productForIdea(products, "acme-docs-extra-five-minutes")).toBeUndefined();
    expect(productForIdea(products, "other-20261002-x")).toBeUndefined();
  });
});
