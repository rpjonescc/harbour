import { checkFileSizes, limitFor } from "./file-size";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");

describe("limitFor", () => {
  it("classifies tests before components and modules", () => {
    expect(limitFor("components/x.test.tsx")?.label).toBe("tests");
    expect(limitFor("tests/e2e/shell.spec.ts")?.label).toBe("tests");
    expect(limitFor("components/ui/Button.tsx")?.label).toBe("components");
    expect(limitFor("lib/auth/sessions.ts")?.label).toBe("typescript");
    expect(limitFor("design/tokens.css")?.label).toBe("css");
  });

  it("excludes generated and vendored files", () => {
    expect(limitFor("drizzle/0000_init.sql")).toBeUndefined();
    expect(limitFor("next-env.d.ts")).toBeUndefined();
    expect(limitFor("pnpm-lock.yaml")).toBeUndefined();
    expect(limitFor("README.md")).toBeUndefined();
  });
});

describe("checkFileSizes", () => {
  it("fails files over the hard limit and warns over the soft limit", () => {
    const report = checkFileSizes([
      { path: "components/Big.tsx", content: lines(301) },
      { path: "components/Soft.tsx", content: lines(201) },
      { path: "components/Ok.tsx", content: lines(200) },
    ]);
    expect(report.errors.map((v) => v.path)).toEqual(["components/Big.tsx"]);
    expect(report.warnings.map((v) => v.path)).toEqual(["components/Soft.tsx"]);
  });

  it("does not count a trailing newline as an extra line", () => {
    const report = checkFileSizes([{ path: "components/Edge.tsx", content: `${lines(300)}\n` }]);
    expect(report.errors).toEqual([]);
  });
});
