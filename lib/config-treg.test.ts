import { parseConfig } from "./config";

const base = {
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://harbour.example.com",
  HARBOUR_RP_ID: "harbour.example.com",
};

describe("Treg settings", () => {
  it("leaves the key unset and converts at 1.55 by default", () => {
    const config = parseConfig(base);
    expect(config.HARBOUR_TREG_API_KEY).toBeUndefined();
    expect(config.HARBOUR_USD_TO_AUD).toBe(1.55);
  });

  it("reads the key and a rate from 1 to 3", () => {
    expect(
      parseConfig({ ...base, HARBOUR_TREG_API_KEY: "example-key", HARBOUR_USD_TO_AUD: "1.4" }),
    ).toMatchObject({ HARBOUR_TREG_API_KEY: "example-key", HARBOUR_USD_TO_AUD: 1.4 });
    expect(parseConfig({ ...base, HARBOUR_USD_TO_AUD: "1" }).HARBOUR_USD_TO_AUD).toBe(1);
    expect(parseConfig({ ...base, HARBOUR_USD_TO_AUD: "3" }).HARBOUR_USD_TO_AUD).toBe(3);
  });

  it.each(["0.99", "3.01", "0", "-1", "abc", ""])("rejects the rate %j", (rate) => {
    expect(() => parseConfig({ ...base, HARBOUR_USD_TO_AUD: rate })).toThrow(/HARBOUR_USD_TO_AUD/);
  });
});

describe("HARBOUR_TREG_TEST_URL", () => {
  const test = {
    ...base,
    HARBOUR_ORIGIN: "http://localhost:3401",
    HARBOUR_RP_ID: "localhost",
    HARBOUR_TEST_MODE: "1",
  };

  it("is unset by default and accepted under test mode on a loopback origin", () => {
    expect(parseConfig(base).HARBOUR_TREG_TEST_URL).toBeUndefined();
    const url = "http://127.0.0.1:3405";
    expect(parseConfig({ ...test, HARBOUR_TREG_TEST_URL: url }).HARBOUR_TREG_TEST_URL).toBe(url);
  });

  it("is refused without test mode, so a deployed Harbour can never send the key elsewhere", () => {
    expect(() => parseConfig({ ...base, HARBOUR_TREG_TEST_URL: "http://127.0.0.1:3405" })).toThrow(
      /HARBOUR_TREG_TEST_URL/,
    );
  });

  it.each([
    "https://treg.example.com",
    "http://192.168.1.5:3405",
    "http://127.0.0.1:3405/path",
    "nope",
  ])("is refused for %s", (url) => {
    expect(() => parseConfig({ ...test, HARBOUR_TREG_TEST_URL: url })).toThrow(
      /HARBOUR_TREG_TEST_URL/,
    );
  });
});
