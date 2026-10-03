import { isPostizUrl, parseConfig } from "./config";

const base = {
  NODE_ENV: "production",
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://pc.tail1234.ts.net",
  HARBOUR_RP_ID: "pc.tail1234.ts.net",
};
const KEY = "SENTINEL-postiz-key";

describe("the Postiz settings (spec 11)", () => {
  it("are unset by default, which leaves the feature off", () => {
    const config = parseConfig(base);
    expect(config.HARBOUR_POSTIZ_URL).toBeUndefined();
    expect(config.HARBOUR_POSTIZ_API_KEY).toBeUndefined();
  });

  it.each([
    ["http://127.0.0.1:4007/api", "http://127.0.0.1:4007/api"],
    ["http://localhost:4007/api/", "http://localhost:4007/api"],
    ["http://[::1]:4007/api", "http://[::1]:4007/api"],
    ["https://postiz.tail1234.ts.net/api", "https://postiz.tail1234.ts.net/api"],
    ["http://100.101.102.103:4007/api", "http://100.101.102.103:4007/api"],
  ])("accepts %s on this machine or the tailnet", (url, kept) => {
    const config = parseConfig({ ...base, HARBOUR_POSTIZ_URL: url, HARBOUR_POSTIZ_API_KEY: KEY });
    expect(config.HARBOUR_POSTIZ_URL).toBe(kept);
  });

  it.each([
    "ftp://127.0.0.1/api",
    "file:///etc/passwd",
    "http://192.168.1.20:4007/api",
    "https://postiz.example.com/api",
    "http://100.128.0.1/api",
    "http://owner:pw@127.0.0.1:4007/api",
    "http://127.0.0.1:4007/api?x=1",
    "http://127.0.0.1:4007/api#top",
    "http://ts.net/api",
    "127.0.0.1:4007",
  ])("refuses %s: the key may only go to this machine or the tailnet", (url) => {
    expect(isPostizUrl(url)).toBe(false);
    expect(() =>
      parseConfig({ ...base, HARBOUR_POSTIZ_URL: url, HARBOUR_POSTIZ_API_KEY: KEY }),
    ).toThrow(/HARBOUR_POSTIZ_URL/);
  });

  it("needs both the address and the key, or neither, and never repeats the key in the error", () => {
    expect(() => parseConfig({ ...base, HARBOUR_POSTIZ_API_KEY: KEY })).toThrow(
      /HARBOUR_POSTIZ_URL/,
    );
    expect(() => parseConfig({ ...base, HARBOUR_POSTIZ_URL: "http://127.0.0.1:4007/api" })).toThrow(
      /HARBOUR_POSTIZ_API_KEY/,
    );
    try {
      parseConfig({ ...base, HARBOUR_POSTIZ_API_KEY: KEY });
    } catch (error) {
      expect(String(error)).not.toContain(KEY);
    }
  });
});
