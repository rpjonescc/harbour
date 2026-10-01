import { GOOGLE_API_HOSTS, outboundHosts } from "./outbound-hosts";

const product = (url: string) => ({ id: "acme", name: "Acme Docs", url, hue: "teal" as const });

describe("outboundHosts", () => {
  it("allows each product's apex and www host plus the Google API hosts", () => {
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
