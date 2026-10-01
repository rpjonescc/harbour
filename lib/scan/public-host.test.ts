import type { LookupAddress } from "node:dns";
import { isNonPublicLiteral, isPublicAddress, publicLookup } from "./public-host";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "2002:a00:1::1",
    "192.0.0.8",
    "198.18.0.1",
    "198.19.255.255",
  ])("refuses the non-public address %s", (address) => {
    expect(isPublicAddress(address, { allowLoopback: false })).toBe(false);
  });

  it.each(["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"])(
    "accepts the public address %s",
    (address) => {
      expect(isPublicAddress(address, { allowLoopback: false })).toBe(true);
    },
  );

  it("accepts loopback only when allowed, and never other private ranges", () => {
    expect(isPublicAddress("127.0.0.1", { allowLoopback: true })).toBe(true);
    expect(isPublicAddress("::1", { allowLoopback: true })).toBe(true);
    expect(isPublicAddress("10.0.0.1", { allowLoopback: true })).toBe(false);
  });
});

describe("isNonPublicLiteral", () => {
  it("refuses private IP literals and leaves names to the lookup", () => {
    const policy = { allowLoopback: false };
    expect(isNonPublicLiteral("[::1]", policy)).toBe(true);
    expect(isNonPublicLiteral("10.0.0.1", policy)).toBe(true);
    expect(isNonPublicLiteral("93.184.216.34", policy)).toBe(false);
    expect(isNonPublicLiteral("localhost", policy)).toBe(false);
    expect(isNonPublicLiteral("127.0.0.1", { allowLoopback: true })).toBe(false);
  });
});

describe("publicLookup", () => {
  const lookupWith = (addresses: LookupAddress[], all: boolean, family = 0) =>
    new Promise<unknown>((resolve) => {
      const lookup = publicLookup(async () => addresses, { allowLoopback: false });
      lookup("docs.example.com", { all, family }, (error, address, fam) =>
        resolve(error ? error.message : { address, fam }),
      );
    });

  it("answers in the form Node asked for", async () => {
    const both: LookupAddress[] = [
      { address: "2606:2800:220:1::1", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ];
    expect(await lookupWith(both, true)).toEqual({ address: both, fam: undefined });
    expect(await lookupWith(both, false)).toEqual({ address: "2606:2800:220:1::1", fam: 6 });
    expect(await lookupWith(both, false, 4)).toEqual({ address: "93.184.216.34", fam: 4 });
  });

  it("refuses a name with any non-public address", async () => {
    const mixed: LookupAddress[] = [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    expect(await lookupWith(mixed, true)).toBe("Refused non-public host docs.example.com");
  });
});
