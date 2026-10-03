import { findPrivateData, parseTerms } from "./private-data";

const file = (content: string, path = "lib/example.ts") => ({ path, content });

describe("parseTerms", () => {
  it("drops comments and blank lines and trims", () => {
    expect(parseTerms("# comment\n\n  Jane Example  \njane@example.org\n")).toEqual([
      "Jane Example",
      "jane@example.org",
    ]);
  });
});

describe("findPrivateData — secrets", () => {
  const cases: [string, string][] = [
    ["private key", "-----BEGIN " + "OPENSSH PRIVATE KEY-----"],
    ["AWS access key", "key = AKIA" + "ABCDEFGHIJKLMNOP"],
    ["GitHub token", `token: ghp_${"a".repeat(36)}`],
    ["Anthropic key", `sk-ant-api03-${"b".repeat(30)}`],
    ["OpenAI-style key", `sk-proj-${"c".repeat(40)}`],
    ["Google API key", `AIza${"d".repeat(35)}`],
    ["Slack token", "xoxb-" + "1234567890-abc"],
    ["real tailnet hostname", "https://pc.tail" + "abc123.ts.net"],
    ["home directory path", "/ho" + "me/alex/project/file"],
  ];
  it.each(cases)("detects a %s", (label, content) => {
    expect(findPrivateData(file(content), []).map((f) => f.label)).toEqual([label]);
  });

  it("ignores fictional examples used in docs", () => {
    const content =
      "https://pc.tail1234.ts.net and <machine>.<tailnet>.ts.net and owner@example.com";
    expect(findPrivateData(file(content), [])).toEqual([]);
  });
});

describe("findPrivateData — owner terms", () => {
  it("matches whole words case-insensitively and reports the line", () => {
    const findings = findPrivateData(file("first line\nWelcome to ACME widgets"), ["Acme"]);
    expect(findings).toEqual([{ path: "lib/example.ts", line: 2, label: 'term "Acme"' }]);
  });

  it("does not match inside longer words", () => {
    expect(findPrivateData(file("pretend to extend"), ["tend"])).toEqual([]);
  });

  it("matches terms containing punctuation such as emails", () => {
    expect(findPrivateData(file("mail jane@example.org now"), ["jane@example.org"])).toHaveLength(
      1,
    );
  });

  it("skips generated files", () => {
    expect(findPrivateData(file("Acme", "pnpm-lock.yaml"), ["Acme"])).toEqual([]);
    expect(findPrivateData(file("Acme", "drizzle/meta/_journal.json"), ["Acme"])).toEqual([]);
  });
});
