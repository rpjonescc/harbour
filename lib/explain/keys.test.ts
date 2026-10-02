import { parseConfig } from "@/lib/config";
import { keyStatusRows } from "@/lib/settings/key-status";
import { keyPhrase, keyPurpose, keySteps } from "./keys";

const BASE = {
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://harbour.example.ts.net",
  HARBOUR_RP_ID: "harbour.example.ts.net",
};
const rows = (env: Record<string, string> = {}, fileExists = () => true) =>
  keyStatusRows(parseConfig({ ...BASE, ...env }), fileExists);
const row = (id: string, env: Record<string, string> = {}, fileExists = () => true) => {
  const found = rows(env, fileExists).find((r) => r.id === id);
  if (!found) throw new Error(`no ${id} row`);
  return found;
};

describe("keys", () => {
  it("has a purpose and setup steps for every key Harbour lists", () => {
    for (const { id } of rows()) {
      expect(keyPurpose(id).length).toBeGreaterThan(10);
      expect(keySteps(id).length).toBeGreaterThan(0);
    }
  });

  it("reads Connected for a key that is set and in use", () => {
    expect(keyPhrase(row("pagespeed", { HARBOUR_PAGESPEED_API_KEY: "x" }))).toEqual({
      text: "Connected",
      tone: "accent",
      note: null,
    });
  });

  it("reads Not connected yet for a missing key", () => {
    expect(keyPhrase(row("claude")).text).toBe("Not connected yet");
  });

  it("never says Connected for a credentials file Harbour can't find, and says why", () => {
    const gsc = row(
      "search-console",
      { HARBOUR_GSC_CREDENTIALS: "/srv/example/gsc.json" },
      () => false,
    );
    const phrase = keyPhrase(gsc);
    expect(phrase.text).toBe("Not connected yet");
    expect(phrase.tone).toBe("warn");
    expect(phrase.note).toContain("can't find the credentials file");
  });

  it("reads Not available yet for a paid source Harbour doesn't collect, even with its key set", () => {
    const phrase = keyPhrase(row("openai", { HARBOUR_OPENAI_API_KEY: "x" }));
    expect(phrase.text).toBe("Not available yet");
  });
});
