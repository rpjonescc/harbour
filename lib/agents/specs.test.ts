import { specForJob } from "./specs";

const products = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" as const },
];

describe("specForJob", () => {
  it("builds a research spec restricted to its one document", () => {
    const spec = specForJob("research", { topic: "glossary" }, products, "2026-10-01");
    expect(spec).toMatchObject({
      kind: "research",
      label: "Research: Glossary",
      targets: ["research/glossary.md"],
      allowed: { prefixes: [], exact: ["research/glossary.md"] },
      proposalsPath: null,
      requiredFiles: [],
    });
  });

  it("builds a discovery spec that needs the owner's notes", () => {
    const spec = specForJob("discovery", { productId: "acme-docs" }, products, "2026-10-01");
    expect(spec).toMatchObject({
      label: "Discovery: Acme Docs",
      targets: ["products/acme-docs/discovery.md", "products/acme-docs/proposals.json"],
      allowed: {
        prefixes: [],
        exact: ["products/acme-docs/discovery.md", "products/acme-docs/proposals.json"],
      },
      proposalsPath: "products/acme-docs/proposals.json",
      requiredFiles: ["products/acme-docs/notes.md"],
    });
  });

  it("rejects unknown topics and products", () => {
    expect(() => specForJob("research", { topic: "nope" }, products, "2026-10-01")).toThrow(
      /unknown research topic/i,
    );
    expect(() => specForJob("discovery", { productId: "nope" }, products, "2026-10-01")).toThrow(
      /unknown product/i,
    );
  });
});
