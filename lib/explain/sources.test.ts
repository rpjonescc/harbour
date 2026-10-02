import { readFileSync } from "node:fs";
import { PAID_SOURCES } from "@/lib/costs/paid-sources";
import { COLLECTOR_IDS } from "@/lib/scan/labels";
import {
  SOURCES,
  sourceExplanation,
  sourceName,
  sourceStatusPhrase,
  sourceTrouble,
} from "./sources";

const ENV_EXAMPLE = readFileSync(".env.example", "utf8");
const SETTING = /HARBOUR_[A-Z_]+/;
const SETTINGS = /HARBOUR_[A-Z_]+/g;

describe("SOURCES", () => {
  it("has an entry for every data source, free and paid, in order", () => {
    expect(SOURCES.map((s) => s.id)).toEqual([...COLLECTOR_IDS, ...PAID_SOURCES.map((p) => p.id)]);
    expect(SOURCES.filter((s) => s.paid).map((s) => s.id)).toEqual(PAID_SOURCES.map((p) => p.id));
  });

  it.each(SOURCES.map((s) => [s.id, s] as const))(
    "gives %s every field, with setting names only in its setup steps",
    (_id, source) => {
      for (const text of [source.name, source.gives, ...Object.values(source.status)]) {
        expect(text.trim()).not.toBe("");
        expect(text).not.toMatch(SETTING);
      }
      expect(source.connect.length).toBeGreaterThan(0);
      for (const setting of source.connect.join(" ").match(SETTINGS) ?? []) {
        expect(ENV_EXAMPLE).toContain(`${setting}=`);
      }
    },
  );

  it("names every setting a paid source needs in its setup steps", () => {
    for (const paid of PAID_SOURCES) {
      const steps = SOURCES.find((s) => s.id === paid.id)?.connect.join(" ") ?? "";
      for (const setting of paid.settings) expect(steps).toContain(setting);
    }
  });
});

describe("source phrases", () => {
  it("say how a source stands after its latest run", () => {
    expect(sourceStatusPhrase("pagespeed", "ok")).toBe("Connected");
    expect(sourceStatusPhrase("pagespeed", "not_configured")).toBe("Not connected yet");
    expect(sourceStatusPhrase("pagespeed", "skipped")).toBe(
      "Runs once a week: waiting for the next run",
    );
    expect(sourceStatusPhrase("search-console", "failed")).toBe(
      "Google didn't send the data in the last check",
    );
    expect(sourceStatusPhrase("crawler", null)).toBe("Runs with the next check");
    expect(sourceStatusPhrase("retired-collector", "failed")).toBe(
      "Had a problem in the last check",
    );
  });

  // Review Focus: one source failing for several products is one problem, named once.
  it("name failing sources once each", () => {
    expect(sourceTrouble([])).toBeNull();
    expect(sourceTrouble([{ collector: "pagespeed" }, { collector: "pagespeed" }])).toBe(
      "Google speed test (PageSpeed) had a problem in the last check",
    );
    expect(sourceTrouble([{ collector: "pagespeed" }, { collector: "crawler" }])).toBe(
      "2 data sources had a problem in the last check",
    );
    expect(sourceName("crawler")).toBe("Page check");
    expect(sourceName("retired-collector")).toBe("retired-collector");
  });
});

describe("sourceExplanation", () => {
  it("finds a source by id and knows when it doesn't", () => {
    expect(sourceExplanation("search-console")?.name).toBe("Google Search Console");
    expect(sourceExplanation("nope")).toBeNull();
  });
});
