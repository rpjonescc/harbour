import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProductConfig, parseProductConfig } from "./config";

const EXAMPLE = "./harbour.config.example.json";
const product = { id: "acme", name: "Acme", url: "https://acme.example.com", hue: "amber" };

function writeTemp(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "harbour-config-")), "harbour.config.json");
  writeFileSync(path, content);
  return path;
}

describe("parseProductConfig", () => {
  it("accepts the committed example config", () => {
    const config = parseProductConfig(JSON.parse(readFileSync(EXAMPLE, "utf8")));
    expect(config.products.map((p) => p.id)).toEqual([
      "acme-docs",
      "lighthouse-cafe",
      "fern-and-field",
    ]);
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      parseProductConfig({ products: [product, { ...product, name: "Other" }] }),
    ).toThrow(/duplicate product id "acme"/i);
  });

  it("rejects an unknown hue", () => {
    expect(() => parseProductConfig({ products: [{ ...product, hue: "orange" }] })).toThrow(/hue/);
  });

  it("rejects a non-http(s) or malformed url", () => {
    for (const url of ["not a url", "ftp://acme.example.com", "javascript:alert(1)"]) {
      expect(() => parseProductConfig({ products: [{ ...product, url }] })).toThrow(/url/);
    }
  });

  it("rejects ids that are not lowercase slugs", () => {
    expect(() => parseProductConfig({ products: [{ ...product, id: "Acme Docs" }] })).toThrow(/id/);
  });

  it("requires between 1 and 12 products", () => {
    expect(() => parseProductConfig({ products: [] })).toThrow();
    const many = Array.from({ length: 13 }, (_, i) => ({ ...product, id: `p-${i}` }));
    expect(() => parseProductConfig({ products: many })).toThrow();
  });
});

describe("loadProductConfig", () => {
  const missing = join(tmpdir(), "harbour-missing", "nope.json");

  it("throws naming the path when an explicit path is missing, without falling back", () => {
    expect(() => loadProductConfig(missing, EXAMPLE)).toThrow(
      new RegExp(`Cannot read product config ${missing}`),
    );
  });

  it("uses the explicit file and is not demo", () => {
    const path = writeTemp(JSON.stringify({ products: [product] }));
    expect(loadProductConfig(path, EXAMPLE)).toEqual({ demo: false, products: [product] });
  });

  it("flags demo when the explicit path is the example file", () => {
    expect(loadProductConfig("harbour.config.example.json", EXAMPLE).demo).toBe(true);
  });

  it("unset: falls back to the example (demo) when the default file does not exist", () => {
    const loaded = loadProductConfig(undefined, EXAMPLE, missing);
    expect(loaded.demo).toBe(true);
    expect(loaded.products[0]?.name).toBe("Acme Docs");
  });

  it("unset: uses the default file when present, not demo", () => {
    const path = writeTemp(JSON.stringify({ products: [product] }));
    expect(loadProductConfig(undefined, EXAMPLE, path)).toEqual({
      demo: false,
      products: [product],
    });
  });

  it("unset: a default path that exists but cannot be read as a file throws", () => {
    const dir = mkdtempSync(join(tmpdir(), "harbour-config-"));
    expect(() => loadProductConfig(undefined, EXAMPLE, dir)).toThrow(/Cannot read product config/);
  });

  it("throws a readable error for an invalid file instead of falling back", () => {
    const path = writeTemp(JSON.stringify({ products: [{ ...product, hue: "orange" }] }));
    expect(() => loadProductConfig(path, EXAMPLE)).toThrow(
      new RegExp(`Invalid product config in ${path}.*hue`, "s"),
    );
  });

  it("throws for malformed JSON instead of falling back", () => {
    const path = writeTemp("{ not json");
    expect(() => loadProductConfig(path, EXAMPLE)).toThrow(/Invalid product config/);
  });
});
