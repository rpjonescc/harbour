import { type Config, parseConfig } from "@/lib/config";
import { keyStatusRows } from "./key-status";

const BASE = {
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://harbour.example.ts.net",
  HARBOUR_RP_ID: "harbour.example.ts.net",
};
const config = (env: Record<string, string> = {}): Config => parseConfig({ ...BASE, ...env });

// Sentinels: none of these may appear anywhere in the rows.
const SECRETS = {
  HARBOUR_CLAUDE_OAUTH_TOKEN: "SENTINEL-claude-token",
  HARBOUR_PAGESPEED_API_KEY: "SENTINEL-pagespeed",
  HARBOUR_GSC_CREDENTIALS: "/srv/harbour-example/SENTINEL-gsc.json",
  HARBOUR_DATAFORSEO_LOGIN: "SENTINEL-dfs-login",
  HARBOUR_DATAFORSEO_PASSWORD: "SENTINEL-dfs-password",
  HARBOUR_OPENAI_API_KEY: "SENTINEL-openai",
  HARBOUR_PERPLEXITY_API_KEY: "SENTINEL-perplexity",
  HARBOUR_GEMINI_API_KEY: "SENTINEL-gemini",
};
const status = (rows: ReturnType<typeof keyStatusRows>) =>
  Object.fromEntries(rows.map((row) => [row.id, row.status]));

describe("keyStatusRows", () => {
  it("lists every key Harbour reads, all missing on a bare config", () => {
    const rows = keyStatusRows(config(), () => true);
    expect(rows.map((row) => [row.id, row.settings, row.inUse, row.paid])).toEqual([
      ["claude", ["HARBOUR_CLAUDE_OAUTH_TOKEN"], true, false],
      ["pagespeed", ["HARBOUR_PAGESPEED_API_KEY"], true, false],
      ["search-console", ["HARBOUR_GSC_CREDENTIALS"], true, false],
      ["dataforseo", ["HARBOUR_DATAFORSEO_LOGIN", "HARBOUR_DATAFORSEO_PASSWORD"], false, true],
      ["openai", ["HARBOUR_OPENAI_API_KEY"], false, true],
      ["perplexity", ["HARBOUR_PERPLEXITY_API_KEY"], false, true],
      ["gemini", ["HARBOUR_GEMINI_API_KEY"], false, true],
    ]);
    expect(rows.every((row) => row.status === "missing")).toBe(true);
    expect(rows.every((row) => row.label.length > 0)).toBe(true);
  });

  it("marks set keys present and never exposes a value or path", () => {
    const rows = keyStatusRows(config(SECRETS), () => true);
    expect(Object.values(status(rows))).toEqual(Array(7).fill("present"));
    const text = JSON.stringify(rows);
    expect(text).not.toContain("SENTINEL");
    expect(text).not.toContain("/srv/harbour-example");
  });

  it("says when the Search Console credentials file does not exist", () => {
    const seen: string[] = [];
    const rows = keyStatusRows(config(SECRETS), (path) => {
      seen.push(path);
      return false;
    });
    expect(status(rows)["search-console"]).toBe("file-not-found");
    expect(seen).toEqual([SECRETS.HARBOUR_GSC_CREDENTIALS]);
  });

  it("needs both DataForSEO settings to call it present", () => {
    const rows = keyStatusRows(config({ HARBOUR_DATAFORSEO_LOGIN: "SENTINEL-dfs-login" }));
    expect(status(rows).dataforseo).toBe("missing");
  });
});
