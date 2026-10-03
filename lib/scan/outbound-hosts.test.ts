import { GOOGLE_API_HOSTS, outboundHosts, TREG_HOST } from "./outbound-hosts";

const product = (url: string) => ({
  id: "acme",
  name: "Acme Docs",
  url,
  hue: "teal" as const,
  kind: "product" as const,
});

describe("outboundHosts", () => {
  it("allows each product's apex and www host plus the Google API hosts and Treg", () => {
    const hosts = outboundHosts([
      product("https://www.example.com/"),
      product("https://acme.example.org"),
    ]);
    expect([...hosts].sort()).toEqual(
      [
        "example.com",
        "www.example.com",
        "acme.example.org",
        "www.acme.example.org",
        ...GOOGLE_API_HOSTS,
        TREG_HOST,
      ].sort(),
    );
  });

  it("lists the Google API hosts the PageSpeed and Search Console collectors need", () => {
    expect([...GOOGLE_API_HOSTS].sort()).toEqual([
      "oauth2.googleapis.com",
      "searchconsole.googleapis.com",
      "www.googleapis.com",
    ]);
  });
});

describe("TREG_HOST", () => {
  it("is exactly treg.to", () => {
    expect(TREG_HOST).toBe("treg.to");
  });
});
