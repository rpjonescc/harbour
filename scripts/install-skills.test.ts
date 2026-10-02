import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkills, sourceLine } from "./install-skills";

describe("installSkills", () => {
  it("copies the atomizer files and writes a SOURCE line like the other skills have", () => {
    const to = mkdtempSync(join(tmpdir(), "harbour-install-"));
    try {
      installSkills({ from: "skills/atomizer", to, source: sourceLine("abc1234", "2026-10-02") });
      for (const file of ["SKILL.md", "platforms.md", "voice-profile.md", "SOURCE"]) {
        expect(existsSync(join(to, "atomizer", file))).toBe(true);
      }
      expect(readFileSync(join(to, "atomizer", "SOURCE"), "utf8")).toBe(
        "Source: https://github.com/rpjonescc/harbour (skills/atomizer) @ abc1234 (installed 2026-10-02)\n",
      );
      expect(readFileSync(join(to, "atomizer", "SKILL.md"), "utf8")).toBe(
        readFileSync("skills/atomizer/SKILL.md", "utf8"),
      );
    } finally {
      rmSync(to, { recursive: true, force: true });
    }
  });

  it("replaces an older install instead of merging into it", () => {
    const to = mkdtempSync(join(tmpdir(), "harbour-install-"));
    try {
      installSkills({ from: "skills/atomizer", to, source: sourceLine("one", "2026-10-01") });
      installSkills({ from: "skills/atomizer", to, source: sourceLine("two", "2026-10-02") });
      expect(readFileSync(join(to, "atomizer", "SOURCE"), "utf8")).toContain("@ two ");
    } finally {
      rmSync(to, { recursive: true, force: true });
    }
  });

  it("refuses when the skills folder is the source itself and keeps the source", () => {
    expect(() =>
      installSkills({
        from: "skills/atomizer",
        to: "skills",
        source: sourceLine("x", "2026-10-02"),
      }),
    ).toThrow(/source itself/);
    expect(existsSync("skills/atomizer/SKILL.md")).toBe(true);
  });
});
