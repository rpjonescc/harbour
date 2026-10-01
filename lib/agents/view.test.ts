import { formatDuration, isActive, jobLabel } from "./view";

const products = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" as const },
];

describe("jobLabel", () => {
  it("names research, discovery, git and scan jobs", () => {
    expect(jobLabel({ kind: "research", params: { topic: "glossary" } }, products)).toBe(
      "Research: Glossary",
    );
    expect(jobLabel({ kind: "research", params: { topic: "gone" } }, products)).toBe(
      "Research: gone",
    );
    expect(jobLabel({ kind: "discovery", params: { productId: "acme-docs" } }, products)).toBe(
      "Discovery: Acme Docs",
    );
    expect(jobLabel({ kind: "brain-push", params: {} }, products)).toBe("Sync brain to GitHub");
    expect(jobLabel({ kind: "backup", params: { day: "2026-10-02" } }, products)).toBe(
      "Nightly backup: 2026-10-02",
    );
    expect(jobLabel({ kind: "retention", params: { day: "2026-10-02" } }, products)).toBe(
      "Retention: 2026-10-02",
    );
    expect(jobLabel({ kind: "notes-sync", params: {} }, products)).toBe("Save notes to GitHub");
    expect(jobLabel({ kind: "scan", params: { productId: "acme-docs" } }, products)).toBe(
      "Scan: Acme Docs",
    );
    expect(jobLabel({ kind: "weekly-analyst", params: { week: "2026-W40" } }, products)).toBe(
      "Weekly report: 2026-W40",
    );
  });
});

describe("formatDuration", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));
  it("formats seconds and minutes", () => {
    expect(formatDuration(at(0), at(45))).toBe("45s");
    expect(formatDuration(at(0), at(185))).toBe("3m 05s");
    expect(formatDuration(null, at(5))).toBe("—");
    expect(formatDuration(at(5), null)).toBe("—");
  });
});

describe("isActive", () => {
  it("is true only for queued and running", () => {
    expect(["queued", "running", "ok", "failed", "cancelled"].map(isActive)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
