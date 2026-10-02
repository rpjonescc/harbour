import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProductConfig, ownerFirstName, parseProductConfig } from "./config";

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

  it("accepts a Search Console domain or URL-prefix property", () => {
    for (const searchConsoleProperty of ["sc-domain:example.com", "https://docs.example.com/"]) {
      const config = parseProductConfig({ products: [{ ...product, searchConsoleProperty }] });
      expect(config.products[0]?.searchConsoleProperty).toBe(searchConsoleProperty);
    }
    expect(parseProductConfig({ products: [product] }).products[0]?.searchConsoleProperty).toBe(
      undefined,
    );
  });

  it("rejects a malformed Search Console property", () => {
    for (const searchConsoleProperty of [
      "example.com",
      "sc-domain:",
      "https://docs.example.com",
      "ftp://docs.example.com/",
      "sc-domain:https://example.com/",
    ]) {
      expect(() =>
        parseProductConfig({ products: [{ ...product, searchConsoleProperty }] }),
      ).toThrow(/searchConsoleProperty/);
    }
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
    expect(loadProductConfig(path, EXAMPLE)).toEqual({
      demo: false,
      products: [{ ...product, kind: "product" }],
    });
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
      products: [{ ...product, kind: "product" }],
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

describe("ownerName", () => {
  const withName = (ownerName: unknown) => parseProductConfig({ ownerName, products: [product] });

  it("is optional, trimmed and kept", () => {
    expect(parseProductConfig({ products: [product] }).ownerName).toBeUndefined();
    expect(withName("  Sam Example ").ownerName).toBe("Sam Example");
    expect(withName("Anne-Marie O'Neil").ownerName).toBe("Anne-Marie O'Neil");
  });

  it("allows at most 40 characters", () => {
    expect(withName("a".repeat(40)).ownerName).toHaveLength(40);
    expect(() => withName("a".repeat(41))).toThrow(/ownerName/);
  });

  it.each(["", "   ", "<b>Sam</b>", "Sam\nSmith", "Sam `x`", "Sam 3rd", 42])(
    "rejects %j, and the error never repeats the name",
    (name) => {
      let message = "";
      try {
        withName(name);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/ownerName/);
      expect(message).not.toContain("Sam");
    },
  );

  it("shows a fictional name in the committed example config", () => {
    const config = parseProductConfig(JSON.parse(readFileSync(EXAMPLE, "utf8")));
    expect(config.ownerName).toBe("Sam Example");
  });
});

describe("ownerFirstName", () => {
  it("is the first word, or null when there is no name", () => {
    expect(ownerFirstName("Sam Example")).toBe("Sam");
    expect(ownerFirstName("Anne-Marie  O'Neil")).toBe("Anne-Marie");
    expect(ownerFirstName(undefined)).toBeNull();
  });
});

describe("product kind", () => {
  const base = {
    id: "acme-docs",
    name: "Acme Docs",
    url: "https://docs.example.com",
    hue: "amber",
  };

  it("defaults to product, so a config with no kind scores as a product site", () => {
    expect(parseProductConfig({ products: [base] }).products[0]?.kind).toBe("product");
  });

  it("accepts news", () => {
    const parsed = parseProductConfig({ products: [{ ...base, kind: "news" }] });
    expect(parsed.products[0]?.kind).toBe("news");
  });

  it("refuses anything else with a message naming the allowed values", () => {
    expect(() => parseProductConfig({ products: [{ ...base, kind: "blog" }] })).toThrow(
      /kind must be one of: news, product/,
    );
  });
});
