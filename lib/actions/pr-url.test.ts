import { parsePullRequestUrl, pullRequestLabel } from "./pr-url";

describe("parsePullRequestUrl", () => {
  it.each([
    ["https://github.com/acme/widget/pull/42", "https://github.com/acme/widget/pull/42"],
    ["  https://github.com/acme/widget/pull/42/  ", "https://github.com/acme/widget/pull/42"],
    [
      "https://github.com/Acme-Co/my.widget_2/pull/7",
      "https://github.com/Acme-Co/my.widget_2/pull/7",
    ],
  ])("accepts and normalises %s", (raw, url) => {
    expect(parsePullRequestUrl(raw)).toEqual({ ok: true, url });
  });

  it.each([
    ["another host", "https://gitlab.com/acme/widget/pull/42"],
    ["a look-alike host", "https://github.com.example.com/acme/widget/pull/42"],
    ["plain http", "http://github.com/acme/widget/pull/42"],
    ["a query string", "https://github.com/acme/widget/pull/42?tab=files"],
    ["an empty query", "https://github.com/acme/widget/pull/42?"],
    ["a fragment", "https://github.com/acme/widget/pull/42#discussion"],
    ["an issue", "https://github.com/acme/widget/issues/42"],
    ["a sub-page", "https://github.com/acme/widget/pull/42/files"],
    ["no number", "https://github.com/acme/widget/pull/abc"],
    ["number zero", "https://github.com/acme/widget/pull/0"],
    ["a dot-only owner", "https://github.com/../widget/pull/42"],
    ["credentials", "https://user@github.com/acme/widget/pull/42"],
    ["a port", "https://github.com:443/acme/widget/pull/42"],
    ["too long", `https://github.com/acme/${"w".repeat(200)}/pull/42`],
    ["not a URL", "acme/widget#42"],
  ])("rejects %s", (_label, raw) => {
    expect(parsePullRequestUrl(raw)).toEqual({ ok: false });
  });
});

describe("pullRequestLabel", () => {
  it("names the repository and number", () => {
    expect(pullRequestLabel("https://github.com/acme/widget/pull/42")).toEqual({
      repo: "acme/widget",
      number: "42",
    });
  });

  it("is null for a value that is not a pull request URL", () => {
    expect(pullRequestLabel("javascript:alert(1)")).toBeNull();
  });
});
