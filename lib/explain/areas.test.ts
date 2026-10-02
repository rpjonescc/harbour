import { AREA_KEYS } from "@/lib/scan/views";
import { AREA_ORDER, AREAS, areaKeyOf, areaNextStep } from "./areas";
import { isComplete } from "./four-parts";

describe("AREAS", () => {
  it("uses the spec's plain names and one-liners, in the scan's area order", () => {
    expect(AREA_ORDER).toEqual(AREA_KEYS);
    expect(AREA_ORDER.map((key) => AREAS[key].name)).toEqual([
      "Found on Google",
      "Recommended by AI assistants",
      "Answer-ready",
    ]);
    expect(AREAS.seo.oneLiner).toBe("Google can find, read and rank your pages.");
    expect(AREAS.geo.oneLiner).toBe(
      "ChatGPT, Perplexity, Gemini and Claude can reach your site, know who you are, and cite you.",
    );
    expect(AREAS.aeo.oneLiner).toBe(
      "Your pages give short, direct answers that Google and AI assistants can quote.",
    );
  });

  it.each(AREA_ORDER)("gives %s all four parts, with no codes in the words", (key) => {
    const area = AREAS[key];
    expect(area.key).toBe(key);
    expect(area.code).toBe(key.toUpperCase());
    expect(isComplete(area.parts)).toBe(true);
    for (const text of [area.name, area.oneLiner, ...Object.values(area.parts)]) {
      expect(text).not.toMatch(/\b(SEO|GEO|AEO)\b/);
    }
  });

  it("maps an action's area code to its key", () => {
    expect(areaKeyOf("SEO")).toBe("seo");
    expect(areaKeyOf("GEO")).toBe("geo");
    expect(areaKeyOf("AEO")).toBe("aeo");
  });

  it("knows a blank part is incomplete", () => {
    expect(isComplete({ ...AREAS.seo.parts, worth: " " })).toBe(false);
  });

  it("points an area's next step at its actions, promising what's worth doing", () => {
    expect(areaNextStep("geo")).toEqual({
      href: "/actions?area=GEO",
      label: "See what's worth doing for Recommended by AI assistants",
    });
  });
});
