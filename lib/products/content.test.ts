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

  it("allows the product's own domain, read the way its checks are stored", () => {
    const hostsFor = (url: string) =>
      contentProducts(
        parseProductConfig({
          products: [{ ...products[0], url }],
          content: { products: { "acme-docs": { terms: ["acme docs"] } } },
        }),
      )[0]?.allowedHosts;
    expect(hostsFor("https://WWW.docs.example.com./x")).toEqual(["docs.example.com"]);
    expect(hostsFor("https://www.com/")).toEqual(["www.com"]);
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

  it("rejects a content entry for a product that is not configured", () => {
    expect(() =>
      parseProductConfig({ products, content: { products: { ghost: { terms: ["boo"] } } } }),
    ).toThrow(/ghost/);
  });

  it("reads the Postiz channel for LinkedIn, Facebook and Instagram (spec 11)", () => {
    const channels = { linkedin: "cm4ean69r0003w8w1cdomox9n", instagram: "example-channel_2" };
    const config = parseProductConfig({ products, content: { postiz: { channels } } });
    expect(config.content?.postiz?.channels).toEqual(channels);
  });

  it.each([
    ["X, which is not used", { channels: { x: "c1" } }],
    ["a blog post, which is not a social post", { channels: { blog: "c1" } }],
    ["a channel id that could change a URL", { channels: { linkedin: "../posts" } }],
    ["an empty channel id", { channels: { linkedin: "" } }],
    ["an unknown key", { channels: {}, type: "now" }],
  ])("rejects Postiz settings with %s", (_label, postiz) => {
    expect(() => parseProductConfig({ products, content: { postiz } })).toThrow();
  });
});

describe("content-only projects (spec 18)", () => {
  const project = { name: "Acme Tools", terms: ["acme tools"] };
  const parse = (projects: unknown, extra: Record<string, unknown> = {}) =>
    parseProductConfig({ products, content: { projects, ...extra } });

  it("lists a project after the sites, with no URL, no allowed host and every platform but website by default", () => {
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
      platforms: ["linkedin", "x", "instagram", "facebook", "blog"],
    });
  });

  it("lets a project list website explicitly", () => {
    const config = parse({ "acme-tools": { ...project, platforms: ["website"] } });
    expect(contentProducts(config)[0]?.platforms).toEqual(["website"]);
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

  it("accepts `constructor` as a project id without a false collision, and never lists `__proto__`", () => {
    expect(contentProducts(parse({ constructor: project })).map((p) => p.id)).toEqual([
      "constructor",
    ]);
    // Either refused or ignored: never a project named __proto__.
    const ids = (() => {
      try {
        return contentProducts(parse(JSON.parse('{"__proto__": {"name": "X", "terms": ["xx"]}}')));
      } catch {
        return [];
      }
    })().map((p) => p.id);
    expect(ids).not.toContain("__proto__");
  });

  const hidden = ["a\nb", "a\u200bb", "a\u202eb", "a\u0000b", "a\u0085b"];
  it.each(hidden)(
    "rejects control or hidden characters in a project name and terms (%j)",
    (bad) => {
      expect(() => parse({ "acme-tools": { ...project, name: `Acme${bad}` } })).toThrow();
      expect(() => parse({ "acme-tools": { ...project, terms: [`acme${bad}`] } })).toThrow();
    },
  );

  it.each(hidden)("rejects them in content.products terms and a product name too (%j)", (bad) => {
    expect(() =>
      parseProductConfig({
        products,
        content: { products: { "acme-docs": { terms: [`acme${bad}`] } } },
      }),
    ).toThrow();
    expect(() =>
      parseProductConfig({ products: [{ ...products[0], name: `Acme${bad}` }] }),
    ).toThrow();
  });
});
