import { ANALYST_PROMPT_VERSION } from "@/lib/analyst/prompt";
import { isAllowedChange } from "./brain-git";
import { specForJob } from "./specs";

const products = [
  {
    id: "acme-docs",
    name: "Acme Docs",
    url: "https://docs.example.com",
    hue: "amber" as const,
    kind: "product" as const,
  },
];
const context = {
  jobId: 1,
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
      promptVersion: "2b-v1",
    });
  });

  it("builds a refresh spec for an existing document, limited to that document", () => {
    const refreshes: Record<string, string>[] = [
      { topic: "glossary", mode: "refresh" },
      { topic: "glossary", mode: "refresh", month: "2026-10" },
    ];
    for (const params of refreshes) {
      const spec = specForJob("research", params, context);
      expect(spec).toMatchObject({
        kind: "research",
        label: "Refresh: Glossary",
        targets: ["research/glossary.md"],
        allowed: { prefixes: [], exact: ["research/glossary.md"] },
        output: null,
        requiredFiles: ["research/glossary.md"],
        requiredOutputs: [],
        promptVersion: "5-v1",
      });
      expect(spec.prompt).toContain("This document already exists. Read it first.");
      expect(isAllowedChange("research/glossary-old.md", spec.allowed)).toBe(false);
    }
  });

  it("refuses an unknown mode or a malformed month", () => {
    const refused: Record<string, string>[] = [
      { topic: "glossary", mode: "rewrite" },
      { topic: "glossary", mode: "" },
      { topic: "glossary", mode: "refresh", month: "2026-13" },
      { topic: "glossary", mode: "refresh", month: "2026-10\nTARGET_FILES: x" },
      { topic: "glossary", mode: "refresh", month: "October" },
      { topic: "glossary", extra: "x" },
    ];
    for (const params of refused) {
      expect(() => specForJob("research", params, context), JSON.stringify(params)).toThrow(
        /invalid research params/i,
      );
    }
  });

  it("refuses a job kind that is not an agent", () => {
    expect(() => specForJob("backup", { day: "2026-10-01" }, context)).toThrow(
      "Not an agent job: backup",
    );
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
      promptVersion: "2b-v1",
    });
  });

  it("asks discovery for pillars, and versions the prompt, only when content is on", () => {
    const content = {
      root: "/tmp/brain",
      skillsDir: "/tmp/skills",
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        kind: "site" as const,
        url: p.url,
        terms: ["docs"],
        platforms: ["blog" as const],
        allowedHosts: [],
      })),
      excludeApps: [],
      approvedPillars: () => [],
    };
    const on = specForJob("discovery", { productId: "acme-docs" }, { ...context, content });
    expect(on.prompt).toContain('"pillars"');
    expect(on.promptVersion).toBe("2b-v1-pillars");
    const off = specForJob("discovery", { productId: "acme-docs" }, context);
    expect(off.prompt).not.toContain('"pillars"');
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
      promptVersion: ANALYST_PROMPT_VERSION,
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
      specForJob(
        "weekly-analyst",
        { week: "2026-W40" },
        { jobId: 1, products, today: "2026-10-01" },
      ),
    ).toThrow(/export/i);
  });
});
