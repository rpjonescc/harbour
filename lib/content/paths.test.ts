import { contentPaths as p } from "./paths";

describe("contentPaths", () => {
  it("builds every path from validated parts", () => {
    expect(p.voice("acme-docs")).toBe("content/voices/acme-docs.md");
    expect(p.digest("2026-10-01")).toBe("content/digests/2026-10-01.md");
    expect(p.idea("acme-docs", "acme-docs-20261002-x")).toBe(
      "content/ideas/acme-docs/acme-docs-20261002-x.md",
    );
    expect(p.piece("acme-docs-20261002-x", "x")).toBe("content/pieces/acme-docs-20261002-x/x.md");
    expect(p.gates("acme-docs-20261002-x", "blog")).toBe(
      "content/pieces/acme-docs-20261002-x/blog.gates.json",
    );
    expect(p.approved("linkedin", "2026-10-02", "five-minutes")).toBe(
      "content/approved/linkedin/2026-10-02-five-minutes.md",
    );
    expect(p.work(431)).toBe("content/work/431.json");
  });

  it.each([
    () => p.voice("../x"),
    () => p.digest("yesterday"),
    () => p.idea("acme-docs", "a/b"),
    () => p.piece("acme-docs-20261002-x", "tiktok" as never),
    () => p.approved("blog", "2026-10-02", "Bad Slug"),
    () => p.work(-1),
    () => p.work(1.5),
  ])("throws for a path that is not made of valid parts (%#)", (build) => {
    expect(build).toThrow();
  });
});
