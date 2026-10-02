import { PIECES } from "@/tests/helpers/content";
import { PLATFORMS } from "./ids";
import { copyParts, primaryText, renderPiece, withPrimaryText, X_SEPARATOR } from "./render";

describe("render", () => {
  it("renders X as numbered posts and copies each post on its own", () => {
    const content = { posts: ["First point.", "Second point."], hashtags: ["#docs"] };
    expect(renderPiece("x", content)).toBe("1/2 First point.\n\n2/2 Second point. #docs");
    expect(copyParts("x", content).map((p) => p.text)).toEqual([
      "First point.",
      "Second point. #docs",
    ]);
  });

  it("renders Instagram with the visual brief and carousel after the caption, and copies caption and hashtags apart", () => {
    const content = {
      ...PIECES.instagram,
      carousel: { slides: [1, 2, 3].map((n) => ({ headline: `Step ${n}`, body: `Do ${n}.` })) },
    };
    const body = renderPiece("instagram", content);
    expect(body.indexOf("Visual brief")).toBeGreaterThan(body.indexOf(PIECES.instagram.caption));
    expect(body).toContain("Slide 2: Step 2");
    expect(copyParts("instagram", content).map((p) => p.label)).toEqual(["Caption", "Hashtags"]);
  });

  it("copies a blog post as clean markdown with its answer first, and a website section as plain text", () => {
    const [post] = copyParts("blog", PIECES.blog);
    expect(post?.text.startsWith(PIECES.blog.answer)).toBe(true);
    expect(post?.text).not.toContain("slug");
    expect(copyParts("website", PIECES.website)[0]?.text).toContain(PIECES.website.heading);
  });

  it.each(PLATFORMS)(
    "replaces only the primary text of a %s piece and keeps the rest",
    (platform) => {
      const content = PIECES[platform];
      const text = platform === "x" ? `Edited one\n\n${X_SEPARATOR}\n\nEdited two` : "Edited text.";
      const edited = withPrimaryText(platform, content, text);
      expect(primaryText(platform, edited)).toContain("Edited");
      const before = content as Record<string, unknown>;
      const after = edited as Record<string, unknown>;
      expect(after.hashtags).toEqual(before.hashtags);
      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    },
  );

  it("refuses a platform it does not know instead of rendering nothing", () => {
    expect(() => renderPiece("tiktok" as never, PIECES.linkedin)).toThrow();
  });
});
