import { readFileSync } from "node:fs";
import { parseProductConfig, trackingFor } from "./config";

const product = { id: "acme", name: "Acme", url: "https://acme.example.com", hue: "amber" };
const parse = (tracking: unknown) => parseProductConfig({ products: [product], tracking });
const tracked = (entry: Record<string, unknown>) => parse({ products: { acme: entry } });

describe("tracking", () => {
  it("is optional, and trackingFor says null when a product has no entry", () => {
    const config = parseProductConfig({ products: [product] });
    expect(config.tracking).toBeUndefined();
    expect(trackingFor(config, "acme")).toBeNull();
  });

  it("fills the country and language defaults", () => {
    const config = tracked({ queries: ["acme docs"], questions: ["What is Acme?"] });
    expect(trackingFor(config, "acme")).toEqual({
      queries: ["acme docs"],
      questions: ["What is Acme?"],
      country: "AU",
      languageCode: "en",
    });
  });

  it("keeps a location, country and language", () => {
    const config = tracked({
      queries: ["acme docs"],
      location: "Queensland,Australia",
      country: "NZ",
      languageCode: "en-GB",
    });
    expect(trackingFor(config, "acme")).toMatchObject({
      location: "Queensland,Australia",
      country: "NZ",
      languageCode: "en-GB",
      questions: [],
    });
  });

  it("accepts the committed example", () => {
    const example = parseProductConfig(
      JSON.parse(readFileSync("harbour.config.example.json", "utf8")),
    );
    expect(trackingFor(example, "acme-docs")?.queries.length).toBeGreaterThan(0);
  });

  it("refuses a product id that is not configured", () => {
    expect(() => parse({ products: { other: { queries: ["acme docs"] } } })).toThrow(
      /tracking.products lists "other"/,
    );
  });

  it("refuses unknown keys, at any level", () => {
    expect(() => tracked({ queries: ["acme docs"], depth: 50 })).toThrow();
    expect(() => parse({ products: {}, extra: 1 })).toThrow();
  });

  it("limits the lists to 8 searches and 5 questions", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `search number ${i}`);
    expect(() => tracked({ queries: many(8) })).not.toThrow();
    expect(() => tracked({ queries: many(9) })).toThrow(/at most 8/);
    expect(() => tracked({ questions: many(5) })).not.toThrow();
    expect(() => tracked({ questions: many(6) })).toThrow(/at most 5/);
  });

  it("limits each text to 3 to 160 characters", () => {
    expect(() => tracked({ queries: ["ab"] })).toThrow(/at least 3/);
    expect(() => tracked({ queries: ["abc"] })).not.toThrow();
    expect(() => tracked({ queries: ["a".repeat(160)] })).not.toThrow();
    expect(() => tracked({ queries: ["a".repeat(161)] })).toThrow(/at most 160/);
    expect(() => tracked({ queries: ["   a   "] })).toThrow(/at least 3/);
  });

  it("refuses duplicates in a list, ignoring case", () => {
    expect(() => tracked({ queries: ["acme docs", "Acme Docs"] })).toThrow(/once/);
    expect(() => tracked({ questions: ["Who is Acme?", "Who is Acme?"] })).toThrow(/once/);
  });

  it.each([
    ["a newline", "acme\ndocs"],
    ["a control character", "acme\u0007docs"],
    ["a tab", "acme\tdocs"],
    ["a zero-width space", "acme\u200bdocs"],
    ["a bidi override", "acme\u202edocs"],
  ])("refuses text with %s, in a search, a question and a location", (_name, text) => {
    expect(() => tracked({ queries: [text] })).toThrow(/plain visible text/);
    expect(() => tracked({ questions: [text] })).toThrow(/plain visible text/);
    expect(() => tracked({ location: text })).toThrow(/plain visible text/);
  });

  it("refuses a country or language that is not a code", () => {
    expect(() => tracked({ country: "au" })).toThrow(/alpha-2/);
    expect(() => tracked({ country: "AUS" })).toThrow(/alpha-2/);
    expect(() => tracked({ languageCode: "English" })).toThrow(/languageCode/);
    expect(() => tracked({ languageCode: "en\nX-Evil: 1" })).toThrow(/languageCode/);
  });
});
