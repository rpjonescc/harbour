import { ACME } from "@/tests/helpers/content";
import { digestSpec } from "./digest";

const context = () =>
  ({
    products: [],
    today: "2026-10-02",
    jobId: 7,
    content: {
      root: "/nonexistent",
      skillsDir: "/nonexistent",
      products: [ACME],
      excludeApps: [],
      digest: {
        day: "2026-10-01",
        window: { start: new Date("2026-09-30T14:00:00Z"), end: new Date("2026-10-01T14:00:00Z") },
        products: [{ productId: "acme-docs", snippets: ["Acme Docs guide"], truncated: false }],
      },
    },
  }) as never;

describe("digestSpec", () => {
  it("is a Write-only, stdin, quiet run that may write exactly one digest file", () => {
    const spec = digestSpec({ day: "2026-10-01" }, context());
    expect(spec).toMatchObject({
      kind: "content-digest",
      stdin: true,
      quiet: true,
      tools: ["Write"],
    });
    expect(spec.allowed).toEqual({ prefixes: [], exact: ["content/digests/2026-10-01.md"] });
    expect(spec.targets).toEqual(["content/work/7.json"]);
  });

  it.each(["2026-13-45", "2026-02-30", "../x", "yesterday", ""])("refuses the day %j", (day) => {
    expect(() => digestSpec({ day }, context())).toThrow();
  });

  it("needs the digest's inputs for that very day, and the content machine on", () => {
    expect(() => digestSpec({ day: "2026-09-30" }, context())).toThrow(/inputs are not available/);
    expect(() =>
      digestSpec({ day: "2026-10-01" }, { products: [], today: "2026-10-02", jobId: 7 } as never),
    ).toThrow(/content machine is off/);
  });
});
