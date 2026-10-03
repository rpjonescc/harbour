import { copyParts } from "@/lib/content/render";
import { PIECES } from "@/tests/helpers/content";
import { POSTIZ_PLATFORMS } from "./channels";
import { postText } from "./text";

describe("postText", () => {
  it("is the LinkedIn and Facebook piece exactly as the Copy button gives it", () => {
    expect(postText("linkedin", PIECES.linkedin)).toBe("Docs that ship in five minutes.\n\n#docs");
    expect(postText("facebook", PIECES.facebook)).toBe("Our getting-started guide, rebuilt.");
    for (const platform of ["linkedin", "facebook"] as const) {
      expect(postText(platform, PIECES[platform])).toBe(
        copyParts(platform, PIECES[platform])[0]?.text,
      );
    }
  });

  it("is the Instagram caption and hashtags, never the visual brief", () => {
    const text = postText("instagram", PIECES.instagram);
    expect(text).toBe("Five minutes to a first deploy.\n\n#taga #tagb #tagc");
    expect(text).not.toContain("stopwatch");
  });

  it("refuses content of another platform's shape instead of guessing", () => {
    for (const platform of POSTIZ_PLATFORMS) {
      expect(() => postText(platform, PIECES.blog)).toThrow();
    }
  });
});
