import { isPublicAddress, resolvePublicHost } from "./public-host";

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

describe("resolvePublicHost", () => {
  it("resolves names and literals, refusing any that reach a private address", async () => {
    await expect(resolvePublicHost("localhost", { allowLoopback: false })).resolves.toBe(false);
    await expect(resolvePublicHost("[::1]", { allowLoopback: false })).resolves.toBe(false);
    await expect(resolvePublicHost("127.0.0.1", { allowLoopback: true })).resolves.toBe(true);
  });
});
