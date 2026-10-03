import { domainKey, productDomain, sameSite, siteKey } from "./site";

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
    expect(siteKey("www.example.com")).toBe("example.com");
  });

  it("keeps www when dropping it would leave a bare suffix or single label", () => {
    expect(siteKey("www.com")).toBe("www.com");
    expect(siteKey("www.localhost")).toBe("www.localhost");
    expect(siteKey("www.www.com")).toBe("www.com");
    expect(siteKey("WWW.Com")).toBe("www.com");
  });
});

describe("domainKey", () => {
  it("drops trailing dots once, then a leading www, like productDomain", () => {
    expect(domainKey("Docs.Example.COM.")).toBe("docs.example.com");
    expect(domainKey("www.example.com..")).toBe("example.com");
    expect(domainKey("www.com.")).toBe("www.com");
    expect(domainKey("www.com")).toBe(productDomain("https://www.com/"));
  });
});
