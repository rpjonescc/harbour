import { parseProductConfig } from "./config";
import { contentProducts } from "./content";

const products = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" },
  { id: "lighthouse-cafe", name: "Lighthouse Café", url: "https://cafe.example.com", hue: "blue" },
];

describe("content config", () => {
  it("enables content only for products with an entry, defaulting to all six platforms", () => {
    const config = parseProductConfig({
      products,
      content: { products: { "acme-docs": { terms: ["acme docs", "acme-docs"] } } },
    });
    const enabled = contentProducts(config);
    expect(enabled.map((p) => p.id)).toEqual(["acme-docs"]);
    expect(enabled[0]).toMatchObject({
      terms: ["acme docs", "acme-docs"],
      platforms: ["linkedin", "x", "instagram", "facebook", "blog", "website"],
    });
  });

  it("is empty when there is no content block", () => {
    expect(contentProducts(parseProductConfig({ products }))).toEqual([]);
  });

  it.each([
    ["no terms", { terms: [] }],
    ["11 terms", { terms: Array.from({ length: 11 }, (_, i) => `term ${i}`) }],
    ["a one-character term", { terms: ["a"] }],
    ["a 41-character term", { terms: ["a".repeat(41)] }],
    ["an unknown platform", { terms: ["acme"], platforms: ["tiktok"] }],
    ["a repeated platform", { terms: ["acme"], platforms: ["x", "x"] }],
    ["an unknown key", { terms: ["acme"], schedule: "daily" }],
  ])("rejects %s", (_label, entry) => {
    expect(() =>
      parseProductConfig({ products, content: { products: { "acme-docs": entry } } }),
    ).toThrow();
  });

  it("rejects a content entry for a product that is not configured, and Postiz settings", () => {
    expect(() =>
      parseProductConfig({ products, content: { products: { ghost: { terms: ["boo"] } } } }),
    ).toThrow(/ghost/);
    expect(() =>
      parseProductConfig({ products, content: { postiz: { channels: { x: "c1" } } } }),
    ).toThrow();
  });
});

describe("content-only projects (spec 18)", () => {
  const project = { name: "Acme Tools", terms: ["acme tools"] };
  const parse = (projects: unknown, extra: Record<string, unknown> = {}) =>
    parseProductConfig({ products, content: { projects, ...extra } });

  it("lists a project after the sites, with no URL, no allowed host and every platform by default", () => {
    const config = parseProductConfig({
      products,
      content: {
        products: { "acme-docs": { terms: ["acme docs"] } },
        projects: { "acme-tools": project },
      },
    });
    expect(contentProducts(config).map((p) => [p.id, p.kind])).toEqual([
      ["acme-docs", "site"],
      ["acme-tools", "project"],
    ]);
    const [site, tools] = contentProducts(config);
    expect(site).toMatchObject({
      url: "https://docs.example.com",
      allowedHosts: ["docs.example.com"],
    });
    expect(tools).toMatchObject({
      name: "Acme Tools",
      url: null,
      allowedHosts: [],
      platforms: ["linkedin", "x", "instagram", "facebook", "blog", "website"],
    });
  });

  it("strips www. from a site's allowed host and allows none for an odd URL's host check", () => {
    const config = parseProductConfig({
      products: [{ ...products[0], url: "https://www.docs.example.com/guide" }],
      content: { products: { "acme-docs": { terms: ["acme docs"] } } },
    });
    expect(contentProducts(config)[0]?.allowedHosts).toEqual(["docs.example.com"]);
  });

  it("is not a product: the product list is unchanged", () => {
    const config = parse({ "acme-tools": project });
    expect(config.products.map((p) => p.id)).toEqual(["acme-docs", "lighthouse-cafe"]);
  });

  it.each([
    ["a product id", { "acme-docs": project }],
    ["an uppercase id", { Acme: project }],
    ["a path id", { "../x": project }],
    ["a 41-character id", { [`a${"b".repeat(40)}`]: project }],
    ["no name", { "acme-tools": { terms: ["acme tools"] } }],
    ["an empty name", { "acme-tools": { ...project, name: " " } }],
    ["no terms", { "acme-tools": { ...project, terms: [] } }],
    ["a one-character term", { "acme-tools": { ...project, terms: ["a"] } }],
    ["a url", { "acme-tools": { ...project, url: "https://example.com" } }],
    ["an unknown platform", { "acme-tools": { ...project, platforms: ["tiktok"] } }],
  ])("rejects %s", (_label, projects) => {
    expect(() => parse(projects)).toThrow();
  });

  it("rejects an id that is already a content.products key, and says which one", () => {
    expect(() =>
      parse({ "acme-docs": project }, { products: { "acme-docs": { terms: ["acme docs"] } } }),
    ).toThrow(/acme-docs/);
  });
});
