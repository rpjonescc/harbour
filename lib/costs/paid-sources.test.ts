import { parseConfig } from "@/lib/config";
import { connectedPaidSources, PAID_SOURCES } from "./paid-sources";

const base = {
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://harbour.example.com",
  HARBOUR_RP_ID: "harbour.example.com",
};

const allKeys = {
  HARBOUR_DATAFORSEO_LOGIN: "owner@example.com",
  HARBOUR_DATAFORSEO_PASSWORD: "example-password",
  HARBOUR_OPENAI_API_KEY: "example-openai-key",
  HARBOUR_PERPLEXITY_API_KEY: "example-perplexity-key",
  HARBOUR_GEMINI_API_KEY: "example-gemini-key",
};

describe("PAID_SOURCES", () => {
  it("lists the paid sources Harbour plans to use, each with its settings", () => {
    expect(PAID_SOURCES.map((s) => s.id)).toEqual(["dataforseo", "openai", "perplexity", "gemini"]);
    for (const source of PAID_SOURCES) {
      expect(source.settings.length, source.id).toBeGreaterThan(0);
      expect(source.label, source.id).not.toBe("");
      expect(source.provides, source.id).not.toBe("");
    }
  });

  it("has no collector yet for any paid source", () => {
    expect(PAID_SOURCES.filter((s) => s.collector !== null)).toEqual([]);
  });
});

describe("connectedPaidSources", () => {
  it("connects none in this phase, even with every key present", () => {
    expect(connectedPaidSources(parseConfig(base))).toEqual([]);
    expect(connectedPaidSources(parseConfig({ ...base, ...allKeys }))).toEqual([]);
  });
});
