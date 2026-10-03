import {
  cleanHost,
  hostMatches,
  hostOfUrl,
  mentionsProduct,
  normalisedUrl,
  productDomain,
} from "./treg-match";

describe("productDomain", () => {
  it("is the product URL's host without a leading www", () => {
    expect(productDomain("https://www.docs.example.com/path")).toBe("docs.example.com");
    expect(productDomain("https://Docs.Example.com")).toBe("docs.example.com");
  });
});

describe("cleanHost and hostOfUrl", () => {
  it("accepts plain hosts and drops www", () => {
    expect(cleanHost("WWW.Example.org")).toBe("example.org");
    expect(cleanHost("a-b.example.org.")).toBe("a-b.example.org");
    expect(hostOfUrl("https://www.example.org/a?b=1")).toBe("example.org");
  });

  it.each(["", "a b.example", "x/y", "<b>x</b>", "-bad.example", "a".repeat(120), "ex\nample.org"])(
    "refuses %j",
    (raw) => {
      expect(cleanHost(raw)).toBeNull();
    },
  );

  it("strips hidden characters before judging", () => {
    expect(cleanHost("exa\u200bmple.org")).toBe("example.org");
  });

  it.each(["javascript:alert(1)", "ftp://example.org/", "not a url", "//example.org"])(
    "refuses the URL %j",
    (raw) => {
      expect(hostOfUrl(raw)).toBeNull();
      expect(normalisedUrl(raw)).toBeNull();
    },
  );

  it("normalises a URL and refuses one over 2,000 characters", () => {
    expect(normalisedUrl("https://Example.org/a b")).toBe("https://example.org/a%20b");
    expect(normalisedUrl(`https://example.org/${"a".repeat(2_000)}`)).toBeNull();
  });
});

describe("hostMatches", () => {
  it("matches the domain and its subdomains only", () => {
    expect(hostMatches("example.com", "example.com")).toBe(true);
    expect(hostMatches("blog.example.com", "example.com")).toBe(true);
    expect(hostMatches("notexample.com", "example.com")).toBe(false);
    expect(hostMatches("example.com.evil.net", "example.com")).toBe(false);
    expect(hostMatches("com", "example.com")).toBe(false);
  });
});

describe("mentionsProduct", () => {
  const product = { name: "Acme Docs", domain: "docs.example.com" };

  it("finds the name as a whole word in any case, and the domain", () => {
    expect(mentionsProduct("try acme docs.", product)).toBe(true);
    expect(mentionsProduct("(ACME DOCS)", product)).toBe(true);
    expect(mentionsProduct("go to docs.example.com/x", product)).toBe(true);
    expect(mentionsProduct("go to www.docs.example.com", product)).toBe(true);
  });

  it("does not find it inside another word or host", () => {
    expect(mentionsProduct("Acme Docsify", product)).toBe(false);
    expect(mentionsProduct("MyAcme Docs", product)).toBe(false);
    expect(mentionsProduct("mydocs.example.com", product)).toBe(false);
    expect(mentionsProduct("Acme and Docs", product)).toBe(false);
  });

  it("is strict about a domain inside a longer host", () => {
    const acme = { name: "Zed", domain: "acmedocs.com" };
    for (const text of [
      "Try acmedocs.com.au for this",
      "Try not-acmedocs.com today",
      "Try acmedocs.com.evil.net",
      "Try xacmedocs.com",
    ]) {
      expect(mentionsProduct(text, acme), text).toBe(false);
    }
    for (const text of [
      "sub.acmedocs.com is it",
      "visit acmedocs.com.",
      "(acmedocs.com)",
      "acmedocs.com/page",
      "acmedocs.com, yes",
    ]) {
      expect(mentionsProduct(text, acme), text).toBe(true);
    }
  });

  it("works for other scripts and accents", () => {
    expect(
      mentionsProduct("Café Müller is open", { name: "Café Müller", domain: "x.example" }),
    ).toBe(true);
    expect(mentionsProduct("Cafés Müller", { name: "Café", domain: "x.example" })).toBe(false);
  });

  it("matches regex characters in a name literally and never throws", () => {
    for (const name of ["(((", "a**", "[", "\\", "a|b", "$^", ".*"]) {
      expect(() => mentionsProduct("text", { name, domain: "x.example" })).not.toThrow();
    }
    expect(mentionsProduct("the .* tool", { name: ".*", domain: "x.example" })).toBe(true);
    expect(mentionsProduct("anything", { name: ".*", domain: "x.example" })).toBe(false);
  });

  it("ignores an empty or oversized name", () => {
    expect(mentionsProduct("text", { name: "  ", domain: "x.example" })).toBe(false);
    const long = "a".repeat(300);
    expect(mentionsProduct(long, { name: long, domain: "x.example" })).toBe(false);
  });

  it("copes with a very large answer", () => {
    const answer = `${"word ".repeat(200_000)} Acme Docs`;
    expect(mentionsProduct(answer, product)).toBe(true);
  });
});
