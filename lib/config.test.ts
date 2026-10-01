import { parseConfig } from "./config";

const base = {
  NODE_ENV: "production",
  HARBOUR_ALLOWED_LOGINS: "Owner@Example.com, other@example.com",
  HARBOUR_ORIGIN: "https://pc.tail1234.ts.net",
  HARBOUR_RP_ID: "pc.tail1234.ts.net",
};

describe("parseConfig", () => {
  it("normalises allowed logins and applies defaults", () => {
    const config = parseConfig(base);
    expect(config.HARBOUR_ALLOWED_LOGINS).toEqual(["owner@example.com", "other@example.com"]);
    expect(config.HARBOUR_DB_PATH).toBe("./data/harbour.db");
    expect(config.HARBOUR_TIMEZONE).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(config.HARBOUR_LOCALE).toBe("en-US");
    expect(config.HARBOUR_CONFIG_PATH).toBeUndefined();
    expect(config.HARBOUR_BRAIN_DIR).toBe("./brain");
  });

  it("defaults the timezone to the server's zone, not a hardcoded one", () => {
    const original = process.env.TZ;
    process.env.TZ = "America/Denver";
    try {
      expect(parseConfig(base).HARBOUR_TIMEZONE).toBe("America/Denver");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("accepts an explicit timezone and locale", () => {
    const config = parseConfig({ ...base, HARBOUR_TIMEZONE: "Europe/Paris", HARBOUR_LOCALE: "fr" });
    expect(config.HARBOUR_TIMEZONE).toBe("Europe/Paris");
    expect(config.HARBOUR_LOCALE).toBe("fr");
  });

  it("rejects an unknown timezone or a malformed locale", () => {
    expect(() => parseConfig({ ...base, HARBOUR_TIMEZONE: "Mars/Olympus" })).toThrow(
      /HARBOUR_TIMEZONE/,
    );
    expect(() => parseConfig({ ...base, HARBOUR_LOCALE: "not a locale" })).toThrow(
      /HARBOUR_LOCALE/,
    );
  });

  it("rejects a missing allowlist", () => {
    expect(() => parseConfig({ ...base, HARBOUR_ALLOWED_LOGINS: " , " })).toThrow();
  });

  it("refuses a dev identity in production", () => {
    expect(() => parseConfig({ ...base, HARBOUR_DEV_IDENTITY: "owner@example.com" })).toThrow(
      /HARBOUR_DEV_IDENTITY/,
    );
  });

  it("allows a dev identity in development", () => {
    const config = parseConfig({ ...base, NODE_ENV: "development", HARBOUR_DEV_IDENTITY: "x@y.z" });
    expect(config.HARBOUR_DEV_IDENTITY).toBe("x@y.z");
  });

  it("rejects HARBOUR_ORIGIN with a trailing slash", () => {
    expect(() => parseConfig({ ...base, HARBOUR_ORIGIN: "https://pc.tail1234.ts.net/" })).toThrow(
      /HARBOUR_ORIGIN must be an origin/,
    );
  });

  it("rejects HARBOUR_ORIGIN with a path", () => {
    expect(() =>
      parseConfig({ ...base, HARBOUR_ORIGIN: "https://pc.tail1234.ts.net/app" }),
    ).toThrow(/HARBOUR_ORIGIN must be an origin/);
  });

  it("accepts an origin with a port when the RP id is its hostname", () => {
    const config = parseConfig({
      ...base,
      HARBOUR_ORIGIN: "https://pc.tail1234.ts.net:8444",
      HARBOUR_RP_ID: "pc.tail1234.ts.net",
    });
    expect(config.HARBOUR_ORIGIN).toBe("https://pc.tail1234.ts.net:8444");
  });

  it("rejects an RP id that does not match the origin's hostname", () => {
    expect(() => parseConfig({ ...base, HARBOUR_RP_ID: "other.tail1234.ts.net" })).toThrow(
      /HARBOUR_RP_ID.*HARBOUR_ORIGIN/,
    );
  });

  it("rejects an RP id that is a bare string suffix but not a domain suffix", () => {
    expect(() => parseConfig({ ...base, HARBOUR_RP_ID: "tail1234.ts.net.evil" })).toThrow();
    expect(() => parseConfig({ ...base, HARBOUR_RP_ID: "1234.ts.net" })).toThrow();
  });

  it("reports an invalid origin as a validation error, not a crash", () => {
    expect(() => parseConfig({ ...base, HARBOUR_ORIGIN: "nope" })).toThrow(/HARBOUR_ORIGIN/);
  });
});

describe("HARBOUR_EDITOR_URL_TEMPLATE", () => {
  it("defaults to VS Code and accepts an empty value to disable", () => {
    expect(parseConfig(base).HARBOUR_EDITOR_URL_TEMPLATE).toBe("vscode://file/{path}");
    expect(
      parseConfig({ ...base, HARBOUR_EDITOR_URL_TEMPLATE: "" }).HARBOUR_EDITOR_URL_TEMPLATE,
    ).toBe("");
  });
  it("requires a {path} placeholder when set", () => {
    expect(() => parseConfig({ ...base, HARBOUR_EDITOR_URL_TEMPLATE: "vscode://file/" })).toThrow(
      /\{path\}/,
    );
  });
});

describe("agent settings", () => {
  it("defaults the CLI, model and timeout, and leaves the token unset", () => {
    const c = parseConfig(base);
    expect(c.HARBOUR_CLAUDE_BIN).toBe("claude");
    expect(c.HARBOUR_AGENT_MODEL).toBe("claude-sonnet-5-5");
    expect(c.HARBOUR_AGENT_TIMEOUT_MINUTES).toBe(30);
    expect(c.HARBOUR_CLAUDE_OAUTH_TOKEN).toBeUndefined();
  });
  it("bounds the timeout", () => {
    expect(() => parseConfig({ ...base, HARBOUR_AGENT_TIMEOUT_MINUTES: "0" })).toThrow();
    expect(() => parseConfig({ ...base, HARBOUR_AGENT_TIMEOUT_MINUTES: "121" })).toThrow();
    expect(
      parseConfig({ ...base, HARBOUR_AGENT_TIMEOUT_MINUTES: "5" }).HARBOUR_AGENT_TIMEOUT_MINUTES,
    ).toBe(5);
  });
});

describe("scan settings", () => {
  it("caps a crawl at 200 pages by default", () => {
    expect(parseConfig(base).HARBOUR_CRAWL_MAX_PAGES).toBe(200);
  });
  it("accepts 1 to 500 pages", () => {
    expect(() => parseConfig({ ...base, HARBOUR_CRAWL_MAX_PAGES: "0" })).toThrow();
    expect(() => parseConfig({ ...base, HARBOUR_CRAWL_MAX_PAGES: "501" })).toThrow();
    expect(parseConfig({ ...base, HARBOUR_CRAWL_MAX_PAGES: "1" }).HARBOUR_CRAWL_MAX_PAGES).toBe(1);
    expect(parseConfig({ ...base, HARBOUR_CRAWL_MAX_PAGES: "500" }).HARBOUR_CRAWL_MAX_PAGES).toBe(
      500,
    );
  });

  it("schedules scans by default and accepts on or off", () => {
    expect(parseConfig(base).HARBOUR_SCHEDULED_SCANS).toBe("on");
    expect(parseConfig({ ...base, HARBOUR_SCHEDULED_SCANS: "off" }).HARBOUR_SCHEDULED_SCANS).toBe(
      "off",
    );
    expect(() => parseConfig({ ...base, HARBOUR_SCHEDULED_SCANS: "no" })).toThrow();
  });
});

describe("PageSpeed settings", () => {
  it("has no API key by default and accepts one", () => {
    expect(parseConfig(base).HARBOUR_PAGESPEED_API_KEY).toBeUndefined();
    const key = "test-pagespeed-key";
    expect(parseConfig({ ...base, HARBOUR_PAGESPEED_API_KEY: key }).HARBOUR_PAGESPEED_API_KEY).toBe(
      key,
    );
  });
});

describe("Search Console settings", () => {
  it("has no credentials file by default and accepts a path", () => {
    expect(parseConfig(base).HARBOUR_GSC_CREDENTIALS).toBeUndefined();
    const path = "/srv/harbour-data/gsc.json";
    expect(parseConfig({ ...base, HARBOUR_GSC_CREDENTIALS: path }).HARBOUR_GSC_CREDENTIALS).toBe(
      path,
    );
    expect(() => parseConfig({ ...base, HARBOUR_GSC_CREDENTIALS: "" })).toThrow();
  });
});

describe("test-only loopback scans", () => {
  // The E2E environment: a loopback origin (never a tailnet one) and an explicit test mode.
  const e2e = {
    ...base,
    HARBOUR_ORIGIN: "http://localhost:3401",
    HARBOUR_RP_ID: "localhost",
    HARBOUR_TEST_MODE: "1",
  };

  it("is off by default, in production and in test mode", () => {
    expect(parseConfig(base).HARBOUR_SCAN_ALLOW_LOOPBACK).toBe(false);
    expect(parseConfig(e2e).HARBOUR_SCAN_ALLOW_LOOPBACK).toBe(false);
  });

  it("is allowed only in test mode", () => {
    const config = parseConfig({ ...e2e, HARBOUR_SCAN_ALLOW_LOOPBACK: "1" });
    expect(config.HARBOUR_SCAN_ALLOW_LOOPBACK).toBe(true);
  });

  it("refuses to start production with loopback scans enabled", () => {
    expect(() => parseConfig({ ...base, HARBOUR_SCAN_ALLOW_LOOPBACK: "1" })).toThrow(
      /HARBOUR_SCAN_ALLOW_LOOPBACK.*HARBOUR_TEST_MODE/,
    );
  });

  it("refuses test mode unless Harbour is served on a loopback origin", () => {
    expect(() => parseConfig({ ...base, HARBOUR_TEST_MODE: "1" })).toThrow(/HARBOUR_TEST_MODE/);
    expect(() =>
      parseConfig({ ...base, HARBOUR_TEST_MODE: "1", HARBOUR_SCAN_ALLOW_LOOPBACK: "1" }),
    ).toThrow(/HARBOUR_TEST_MODE/);
  });

  it("accepts only 0 or 1", () => {
    expect(() => parseConfig({ ...e2e, HARBOUR_SCAN_ALLOW_LOOPBACK: "true" })).toThrow();
    expect(() => parseConfig({ ...e2e, HARBOUR_TEST_MODE: "yes" })).toThrow();
  });
});
