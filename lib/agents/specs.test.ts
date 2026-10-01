import { isAllowedChange } from "./brain-git";
import { specForJob } from "./specs";

const products = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" as const },
];
const context = {
  products,
  today: "2026-10-01",
  weeklyExport: (week: string) => `{"week":"${week}"}`,
};

describe("specForJob", () => {
  it("builds a research spec restricted to its one document", () => {
    const spec = specForJob("research", { topic: "glossary" }, context);
    expect(spec).toMatchObject({
      kind: "research",
      label: "Research: Glossary",
      targets: ["research/glossary.md"],
      allowed: { prefixes: [], exact: ["research/glossary.md"] },
      output: null,
      requiredFiles: [],
      requiredOutputs: [],
    });
  });

  it("builds a discovery spec that needs the owner's notes", () => {
    const spec = specForJob("discovery", { productId: "acme-docs" }, context);
    expect(spec).toMatchObject({
      label: "Discovery: Acme Docs",
      targets: ["products/acme-docs/discovery.md", "products/acme-docs/proposals.json"],
      allowed: {
        prefixes: [],
        exact: ["products/acme-docs/discovery.md", "products/acme-docs/proposals.json"],
      },
      output: { kind: "discovery", path: "products/acme-docs/proposals.json" },
      requiredFiles: ["products/acme-docs/notes.md"],
      requiredOutputs: ["products/acme-docs/proposals.json"],
    });
  });

  it("rejects unknown topics and products", () => {
    expect(() => specForJob("research", { topic: "nope" }, context)).toThrow(
      /unknown research topic/i,
    );
    expect(() => specForJob("discovery", { productId: "nope" }, context)).toThrow(
      /unknown product/i,
    );
  });

  it("accepts exactly the spec's paths and rejects siblings", () => {
    const spec = specForJob("discovery", { productId: "acme-docs" }, context);
    expect(spec.allowed.exact).not.toBe(spec.targets);
    for (const path of spec.targets) expect(isAllowedChange(path, spec.allowed)).toBe(true);
    expect(isAllowedChange("products/acme-docs/notes.md", spec.allowed)).toBe(false);
    expect(isAllowedChange("products/acme-docs/other.json", spec.allowed)).toBe(false);
  });

  it("builds a weekly analyst spec that may write exactly its report and proposals", () => {
    const spec = specForJob("weekly-analyst", { week: "2026-W40" }, context);
    const targets = ["reports/weekly/2026-W40.md", "reports/weekly/2026-W40.proposals.json"];
    expect(spec).toMatchObject({
      kind: "weekly-analyst",
      label: "Weekly report: 2026-W40",
      targets,
      allowed: { prefixes: [], exact: targets },
      output: { kind: "weekly", path: "reports/weekly/2026-W40.proposals.json" },
      requiredFiles: [],
      requiredOutputs: targets,
    });
    expect(spec.prompt.split("\n")[0]).toBe(`TARGET_FILES: ${targets.join(", ")}`);
    expect(spec.prompt).toContain('{"week":"2026-W40"}');
    expect(isAllowedChange("reports/weekly/2026-W39.md", spec.allowed)).toBe(false);
    expect(isAllowedChange("reports/weekly/2026-W40.json", spec.allowed)).toBe(false);
  });

  it("refuses a weekly run without a well-formed week or an export", () => {
    for (const week of ["2026-40", "../../etc", "2026-W40/x", ""]) {
      expect(() => specForJob("weekly-analyst", { week }, context), week).toThrow(/invalid week/i);
    }
    expect(() => specForJob("weekly-analyst", {}, context)).toThrow(/invalid week/i);
    expect(() =>
      specForJob("weekly-analyst", { week: "2026-W40" }, { products, today: "2026-10-01" }),
    ).toThrow(/export/i);
  });
});
