import { parseConfig } from "@/lib/config";
import { connectedPaidSources, PAID_SOURCES } from "./paid-sources";

const base = {
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://harbour.example.com",
  HARBOUR_RP_ID: "harbour.example.com",
};

const allKeys = {
  HARBOUR_TREG_API_KEY: "example-treg-key",
  HARBOUR_DATAFORSEO_LOGIN: "owner@example.com",
  HARBOUR_DATAFORSEO_PASSWORD: "example-password",
  HARBOUR_OPENAI_API_KEY: "example-openai-key",
  HARBOUR_PERPLEXITY_API_KEY: "example-perplexity-key",
  HARBOUR_GEMINI_API_KEY: "example-gemini-key",
};

describe("PAID_SOURCES", () => {
  it("lists the paid sources Harbour plans to use, each with its settings", () => {
    expect(PAID_SOURCES.map((s) => s.id)).toEqual([
      "treg",
      "dataforseo",
      "openai",
      "perplexity",
      "gemini",
    ]);
    for (const source of PAID_SOURCES) {
      expect(source.settings.length, source.id).toBeGreaterThan(0);
      expect(source.label, source.id).not.toBe("");
    }
  });

  it("has a collector for Treg only, so far", () => {
    expect(
      PAID_SOURCES.filter((s) => s.collector !== null).map((s) => [s.id, s.collector]),
    ).toEqual([["treg", "treg"]]);
    expect(PAID_SOURCES.find((s) => s.id === "treg")?.settings).toEqual(["HARBOUR_TREG_API_KEY"]);
  });
});

describe("connectedPaidSources", () => {
  it("connects Treg only, and only with its key: sources without a collector never connect", () => {
    expect(connectedPaidSources(parseConfig(base))).toEqual([]);
    const connected = connectedPaidSources(parseConfig({ ...base, ...allKeys }));
    expect(connected.map((s) => s.id)).toEqual(["treg"]);
  });
});
