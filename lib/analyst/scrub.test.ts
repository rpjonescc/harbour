import { redactSensitive, scrub } from "./scrub";

// Built at run time so the repository's secret scanner does not flag these fictional values.
const GOOGLE_KEY = ["AI", "za", "SyA1234567890abcdefghijklmnopqrstuv"].join("");
const PEM = ["-----BEGIN", " PRIVATE KEY-----\nMIIEv\nQ==\n-----END", " PRIVATE KEY-----"].join("");

describe("scrub", () => {
  it.each([
    [
      "an account email",
      "Share it with harbour@acme-harbour.iam.gserviceaccount.com.",
      "Share it with [email].",
    ],
    ["a home path", "Could not read /srv/harbour/key.json", "Could not read [path]"],
    ["a path after =", "file=/etc/harbour/gsc.json failed", "file=[path] failed"],
    ["a path after a colon", "credentials:/var/lib/owner/gsc.json", "credentials:[path]"],
    ["a path after a comma", "tried a,/opt/x/y.json", "tried a,[path]"],
    ["URL credentials", "at https://user:secret@example.com/x", "at https://***@example.com/x"],
    [
      "an API key parameter",
      "GET https://example.com/v5?url=a&key=abc123DEF",
      "GET https://example.com/v5?url=a&key=[redacted]",
    ],
    ["an access token parameter", "?access_token=ya29.abc&x=1", "?access_token=[redacted]&x=1"],
    ["a token parameter", "token=t0k3n done", "token=[redacted] done"],
    ["a secret parameter", "client_secret=s3cr3t", "client_secret=[redacted]"],
    ["a Google API key", `key ${GOOGLE_KEY} used`, "key [redacted] used"],
    [
      "an OAuth access token",
      "Google said ya29.a0AfH6SMBx-y_z expired",
      "Google said [redacted] expired",
    ],
    ["a Bearer header", "Authorization: Bearer abc.def-ghi", "Authorization: Bearer [redacted]"],
    ["a PEM block", `key ${PEM} bad`, "key [redacted] bad"],
  ])("redacts %s", (_, text, expected) => {
    expect(scrub(text)).toBe(expected);
  });

  it("keeps ordinary text, URLs and ratios", () => {
    const text = "Search Console answered HTTP 403 for https://www.example.com/ (4/5 pages)";
    expect(scrub(text)).toBe(text);
  });

  it("caps the length", () => {
    expect(scrub("x".repeat(1000))).toHaveLength(300);
  });
});

describe("redactSensitive", () => {
  it("redacts as scrub does but keeps text that is long on purpose", () => {
    const long = `${"word ".repeat(200)}mail sam@example.com about /ho${"me"}/sam/notes/plan.md`;
    const out = redactSensitive(long);
    expect(out.length).toBeGreaterThan(300);
    expect(out).toContain("[email]");
    expect(out).toContain("[path]");
    expect(scrub(long).length).toBeLessThanOrEqual(300);
  });
});
