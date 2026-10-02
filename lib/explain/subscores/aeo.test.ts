import { AEO_SUB_SCORES } from "@/lib/scan/scoring/aeo";
import type { ScanObservation } from "@/lib/scan/types";
import {
  ACME_SCAN,
  ALL_OK,
  CONTEXT,
  crawlSite,
  entryOf,
  htmlPage,
  readiness,
  scoreOf,
} from "@/tests/helpers/scoring";
import { isComplete } from "../four-parts";
import { AEO_EXPLANATIONS } from "./aeo";

function explanation(key: string) {
  const found = AEO_EXPLANATIONS.find((e) => e.key === key);
  if (!found) throw new Error(`No explanation for ${key}`);
  return found;
}
const lineOf = (observations: ScanObservation[], key: string) =>
  explanation(key).summarise(entryOf(scoreOf(observations), key)?.evidence ?? "");
const otherCollectors = ACME_SCAN.filter((o) => o.collector !== "crawler");

describe("AEO explanations", () => {
  it("explain every AEO sub-score of the current formula, in formula order and in full", () => {
    expect(AEO_EXPLANATIONS.map((e) => e.key)).toEqual(AEO_SUB_SCORES.map((s) => s.key));
    for (const e of AEO_EXPLANATIONS) {
      expect(e.name.trim()).not.toBe("");
      expect(isComplete(e.parts)).toBe(true);
    }
  });

  it.each([
    ["aeo.qaCoverage", "2 of 5 pages are marked up as questions and answers."],
    [
      "aeo.conciseAnswers",
      "4 of 6 question headings get a short, direct answer straight underneath.",
    ],
    ["aeo.preferredSources", "4 pages changed in the last 30 days."],
  ])("read %s's real evidence in plain words", (key, line) => {
    expect(lineOf(ACME_SCAN, key)).toBe(line);
  });

  it("say when no heading asks a question, for one page or several", () => {
    const one = [htmlPage("/"), crawlSite(), ...otherCollectors];
    expect(lineOf(one, "aeo.conciseAnswers")).toBe(
      "Your page doesn't ask a question in a heading yet.",
    );
    const two = [htmlPage("/"), htmlPage("/a"), crawlSite(), ...otherCollectors];
    expect(lineOf(two, "aeo.conciseAnswers")).toBe(
      "None of your 2 pages ask a question in a heading yet.",
    );
  });

  it("say when there is no Preferred Sources button", () => {
    const scan = [
      ...ACME_SCAN.filter((o) => o.collector !== "readiness"),
      readiness({
        preferredSources: { button: false, buttonPages: [], freshUrls: 1, freshContent: false },
      }),
    ];
    const news = scoreOf(scan, ALL_OK, { ...CONTEXT, productKind: "news" });
    const evidence = entryOf(news, "aeo.preferredSources")?.evidence ?? "";
    expect(explanation("aeo.preferredSources").summarise(evidence)).toBe(
      "There's no Preferred Sources button yet, and 1 page changed in the last 30 days.",
    );
  });

  it("reads the freshness-only evidence of a product site", () => {
    const evidence = "3 URLs updated in the last 30 days (fresh content).";
    expect(explanation("aeo.preferredSources").summarise(evidence)).toBe(
      "3 pages changed in the last 30 days.",
    );
  });

  it("never read featured snippets, which are always missing for now", () => {
    expect(explanation("aeo.snippets").summarise("anything")).toBeNull();
  });

  it("return null for wording they don't know", () => {
    for (const e of AEO_EXPLANATIONS)
      expect(e.summarise("Wording from an older formula")).toBeNull();
  });
});
