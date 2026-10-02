import { readFileSync } from "node:fs";

// Every setting the app reads is documented twice, in the README's Configuration table and in
// `.env.example`; a setting added to `lib/config.ts` without both fails here.
const read = (path: string) => readFileSync(path, "utf8");
const names = (text: string, pattern: RegExp) =>
  new Set([...text.matchAll(pattern)].map((m) => m[1] ?? ""));

const inConfig = names(read("lib/config.ts"), /^ {4}(HARBOUR_[A-Z_]+):/gm);
const inReadme = names(read("README.md"), /^\| `(HARBOUR_[A-Z_]+)`/gm);
const inExample = names(read(".env.example"), /^#? ?(HARBOUR_[A-Z_]+)=/gm);
// Shell variables the deploy script reads: documented, but not part of the app's configuration.
const SHELL_ONLY = ["HARBOUR_HTTPS_PORT"];
// A stand-in login for `next dev`, refused in production: not offered in the production template.
const NOT_IN_EXAMPLE = ["HARBOUR_DEV_IDENTITY"];

describe("the documented settings", () => {
  it("reads settings that exist (the pattern found them)", () => {
    expect(inConfig.size).toBeGreaterThan(30);
    expect(inConfig.has("HARBOUR_CONTENT")).toBe(true);
  });

  it("lists every setting the app reads in the README table, and nothing the app does not read", () => {
    expect([...inConfig].filter((n) => !inReadme.has(n))).toEqual([]);
    expect([...inReadme].filter((n) => !inConfig.has(n) && !SHELL_ONLY.includes(n))).toEqual([]);
  });

  it("lists every setting the app reads in .env.example, and nothing the app does not read", () => {
    expect([...inConfig].filter((n) => !inExample.has(n) && !NOT_IN_EXAMPLE.includes(n))).toEqual(
      [],
    );
    expect([...inExample].filter((n) => !inConfig.has(n) && !SHELL_ONLY.includes(n))).toEqual([]);
  });
});
