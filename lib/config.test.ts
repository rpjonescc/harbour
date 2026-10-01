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
