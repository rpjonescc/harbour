import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { VOICE_ACME } from "@/tests/helpers/content";
import { readVoice } from "./voice";

const PATH = "content/voices/acme-docs.md";

describe("readVoice", () => {
  const read = (files: Record<string, string>, prepare?: (root: string) => void) => {
    const { root, cleanup } = makeBrain(files);
    try {
      prepare?.(root);
      return readVoice(root, "acme-docs");
    } finally {
      cleanup();
    }
  };

  it("reads a valid profile, and says missing when there is none", () => {
    expect(read({ [PATH]: VOICE_ACME })).toMatchObject({ state: "ok" });
    expect(read({})).toEqual({ state: "missing" });
  });

  it("says why a profile cannot be used, without throwing", () => {
    expect(read({ [PATH]: "no frontmatter" })).toMatchObject({ state: "invalid" });
    expect(read({ [PATH]: VOICE_ACME.replace("product: acme-docs", "product: other") })).toEqual({
      state: "invalid",
      reason: "The voice profile is for another product.",
    });
  });

  it("refuses an oversize file, a symlink and text that is not UTF-8", () => {
    expect(read({ [PATH]: `${VOICE_ACME}\n${"x".repeat(70_000)}` })).toMatchObject({
      state: "invalid",
      reason: expect.stringMatching(/too large/),
    });
    const linked = read({ "other.md": VOICE_ACME, "content/voices/keep.md": "" }, (root) =>
      symlinkSync(join(root, "other.md"), join(root, PATH)),
    );
    expect(linked).toMatchObject({ state: "invalid" });
  });

  it("refuses non-UTF-8 bytes in the profile itself", () => {
    const { root, cleanup } = makeBrain({});
    try {
      const dir = join(root, "content/voices");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "acme-docs.md"), Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe]));
      expect(readVoice(root, "acme-docs")).toMatchObject({
        state: "invalid",
        reason: expect.stringMatching(/UTF-8/),
      });
    } finally {
      cleanup();
    }
  });
});
