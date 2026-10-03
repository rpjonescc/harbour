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
