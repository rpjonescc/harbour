import { parseConfig } from "./config";

const base = {
  NODE_ENV: "production",
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://pc.tail1234.ts.net",
  HARBOUR_RP_ID: "pc.tail1234.ts.net",
};

describe("the content machine settings", () => {
  it("is off by default, with a loopback Screenpipe, a 05:45 digest and 24 runs a day", () => {
    const config = parseConfig(base);
    expect(config).toMatchObject({
      HARBOUR_CONTENT: "off",
      HARBOUR_SCREENPIPE_URL: "http://127.0.0.1:3030",
      HARBOUR_SCHEDULED_DIGEST: "on",
      HARBOUR_DIGEST_TIME: "05:45",
      HARBOUR_SCHEDULED_IDEAS: "on",
      HARBOUR_CONTENT_DAILY_RUNS: 24,
    });
    expect(config.HARBOUR_SCREENPIPE_API_KEY).toBeUndefined();
    expect(config.HARBOUR_SKILLS_DIR).toMatch(/\.claude[\\/]skills$/);
  });

  it.each(["http://127.0.0.1:3030", "http://localhost:3030", "http://[::1]:3030"])(
    "accepts the loopback Screenpipe URL %s",
    (url) => {
      expect(parseConfig({ ...base, HARBOUR_SCREENPIPE_URL: url }).HARBOUR_SCREENPIPE_URL).toBe(
        url,
      );
    },
  );

  it.each([
    "http://192.168.1.20:3030",
    "https://127.0.0.1:3030",
    "http://example.com:3030",
    "http://127.0.0.1:3030/health",
    "http://127.0.0.1:3030/",
    "localhost:3030",
  ])("refuses the Screenpipe URL %s: the key must never cross a network", (url) => {
    expect(() => parseConfig({ ...base, HARBOUR_SCREENPIPE_URL: url })).toThrow(
      /HARBOUR_SCREENPIPE_URL/,
    );
  });

  it.each([
    ["HARBOUR_CONTENT", "maybe"],
    ["HARBOUR_DIGEST_TIME", "5:45"],
    ["HARBOUR_CONTENT_DAILY_RUNS", "0"],
    ["HARBOUR_CONTENT_DAILY_RUNS", "101"],
    ["HARBOUR_CONTENT_DAILY_RUNS", "2.5"],
  ])("names %s when it is %j", (name, value) => {
    expect(() => parseConfig({ ...base, [name]: value })).toThrow(new RegExp(name));
  });

  it("refuses a skills folder inside the brain (the brain is pushed to a remote)", () => {
    expect(() =>
      parseConfig({
        ...base,
        HARBOUR_BRAIN_DIR: "/tmp/harbour-brain-x",
        HARBOUR_SKILLS_DIR: "/tmp/harbour-brain-x/skills",
      }),
    ).toThrow(/HARBOUR_SKILLS_DIR/);
  });
});
