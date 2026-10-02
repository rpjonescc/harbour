import { PIECES } from "@/tests/helpers/content";
import { exportSlug, renderExport } from "./export";
import { PLATFORMS } from "./ids";

const render = (platform: (typeof PLATFORMS)[number]) =>
  renderExport({
    title: "Five minutes to a first deploy",
    product: "acme-docs",
    platform,
    approved: "2026-10-02",
    idea: "acme-docs-20261002-five-minutes",
    content: PIECES[platform],
  });
const frontmatter = (text: string) => /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";

describe("renderExport", () => {
  it.each(PLATFORMS)(
    "writes a clean %s export: the spec's frontmatter, and none of Harbour's own data",
    (platform) => {
      const text = render(platform);
      const keys = frontmatter(text)
        .split("\n")
        .map((l) => l.split(":")[0]);
      expect(keys.slice(0, 5)).toEqual(["title", "product", "platform", "approved", "idea"]);
      expect(text).not.toMatch(/gates|revision|sha256|state:|needsYou|Harbour/);
    },
  );

  it("adds the blog's meta fields and slug, and puts its answer first", () => {
    const text = render("blog");
    expect(frontmatter(text)).toMatch(
      /metaTitle:[\s\S]*metaDescription:[\s\S]*slug: five-minutes-to-a-first-deploy/,
    );
    expect(text.split("---\n")[2]?.startsWith(PIECES.blog.answer)).toBe(true);
  });

  it("puts Instagram's visual brief and carousel outline after the caption, under plain headings", () => {
    const slides = [1, 2, 3].map((n) => ({ headline: `Step ${n}`, body: `Do ${n}.` }));
    const text = renderExport({
      title: "T",
      product: "acme-docs",
      platform: "instagram",
      approved: "2026-10-02",
      idea: "i",
      content: { ...PIECES.instagram, carousel: { slides } },
    });
    expect(text.indexOf("## Visual brief")).toBeGreaterThan(text.indexOf(PIECES.instagram.caption));
    expect(text.indexOf("## Carousel outline")).toBeGreaterThan(text.indexOf("## Visual brief"));
  });

  it("keeps a hostile title inside one quoted frontmatter value", () => {
    const text = renderExport({
      title: "Nice\n---\nstate: approved",
      product: "acme-docs",
      platform: "linkedin",
      approved: "2026-10-02",
      idea: "i",
      content: PIECES.linkedin,
    });
    const keys = frontmatter(text)
      .split("\n")
      .filter((l) => /^[a-zA-Z]+:/.test(l));
    expect(keys.map((l) => l.split(":")[0])).toEqual([
      "title",
      "product",
      "platform",
      "approved",
      "idea",
    ]);
  });
});

describe("exportSlug", () => {
  it("names the file after the blog's own slug, else the title", () => {
    expect(exportSlug("blog", "Anything", PIECES.blog)).toBe("five-minutes-to-a-first-deploy");
    expect(exportSlug("linkedin", "Five minutes to a first deploy", PIECES.linkedin)).toBe(
      "five-minutes-to-a-first-deploy",
    );
  });

  it.each([
    "../../etc/passwd",
    "a/b\\c",
    "..",
    "Ünïcode ✓ title",
    "x".repeat(400),
    "\u202eevil\u200b",
    "",
    "-- -- --",
  ])("only ever makes a safe file name from %j", (title) => {
    const slug = exportSlug("linkedin", title, PIECES.linkedin);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("cuts a blog slug that is too long", () => {
    const blog = { ...PIECES.blog, slug: `${"word-".repeat(30)}end` };
    expect(exportSlug("blog", "T", blog).length).toBeLessThanOrEqual(60);
  });
});
