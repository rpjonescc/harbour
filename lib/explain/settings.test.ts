import { SETTINGS_INTRO, SETTINGS_PURPOSE } from "./settings";
import { termLineText } from "./term-line";

describe("Settings words", () => {
  it("gives every section one short, plain line that names no file or setting", () => {
    for (const line of Object.values(SETTINGS_PURPOSE)) {
      expect(line.length).toBeGreaterThan(10);
      expect(line.length).toBeLessThanOrEqual(110);
      expect(line.slice(0, -1)).not.toMatch(/[.!?]/); // one sentence
      expect(line).not.toMatch(/HARBOUR_|\.env|\.json/);
    }
  });

  it("keeps the file names for Technical details, out of the visible line", () => {
    expect(termLineText(SETTINGS_INTRO.line)).not.toMatch(/HARBOUR_|\.env|\.json/);
    expect(SETTINGS_INTRO.files).toContain(".env");
    expect(SETTINGS_INTRO.files).toContain("harbour.config.json");
  });
});
