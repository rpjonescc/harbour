import { sameSite, siteKey } from "./site";

const url = (href: string) => new URL(href);

describe("sameSite", () => {
  it("allows the same host and the www/apex swap both ways", () => {
    expect(sameSite(url("https://example.com/a"), url("https://example.com/b"))).toBe(true);
    expect(sameSite(url("https://example.com/"), url("https://www.example.com/"))).toBe(true);
    expect(sameSite(url("https://www.example.com/"), url("https://example.com/"))).toBe(true);
  });

  it("allows a subdomain of the start host", () => {
    expect(sameSite(url("https://example.com/"), url("https://docs.example.com/"))).toBe(true);
  });

  it("refuses siblings, parents and other sites", () => {
    expect(sameSite(url("https://a.example.com/"), url("https://b.example.com/"))).toBe(false);
    expect(sameSite(url("https://acme.github.io/"), url("https://github.io/"))).toBe(false);
    expect(sameSite(url("https://example.com/"), url("https://example.org/"))).toBe(false);
    expect(sameSite(url("https://example.com/"), url("https://notexample.com/"))).toBe(false);
  });
});

describe("siteKey", () => {
  it("drops a leading www. and lowercases", () => {
    expect(siteKey("WWW.Example.com")).toBe("example.com");
    expect(siteKey("docs.example.com")).toBe("docs.example.com");
  });
});
