import { parseConfig } from "@/lib/config";
import { decideGate } from "./gate";

const config = parseConfig({
  NODE_ENV: "production",
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://pc.tail.ts.net",
  HARBOUR_RP_ID: "pc.tail.ts.net",
});
const me = new Headers({ host: "pc.tail.ts.net", "Tailscale-User-Login": "owner@example.com" });

describe("decideGate", () => {
  it("forbids a request for any host but HARBOUR_ORIGIN's, even with a valid identity", () => {
    for (const host of ["127.0.0.1:3400", "evil.example.com", "pc.tail.ts.net:8444", null]) {
      const headers = new Headers(me);
      if (host === null) headers.delete("host");
      else headers.set("host", host);
      expect(decideGate({ headers, pathname: "/", hasSessionCookie: true }, config)).toEqual({
        kind: "forbid",
      });
    }
    const upper = new Headers(me);
    upper.set("host", "PC.Tail.ts.net");
    expect(decideGate({ headers: upper, pathname: "/", hasSessionCookie: true }, config).kind).toBe(
      "next",
    );
  });

  it("matches the origin's port when it has one", () => {
    const withPort = parseConfig({
      NODE_ENV: "production",
      HARBOUR_ALLOWED_LOGINS: "owner@example.com",
      HARBOUR_ORIGIN: "https://pc.tail.ts.net:8444",
      HARBOUR_RP_ID: "pc.tail.ts.net",
    });
    const headers = new Headers(me);
    headers.set("host", "pc.tail.ts.net:8444");
    expect(decideGate({ headers, pathname: "/", hasSessionCookie: true }, withPort).kind).toBe(
      "next",
    );
    headers.set("host", "pc.tail.ts.net");
    expect(decideGate({ headers, pathname: "/", hasSessionCookie: true }, withPort).kind).toBe(
      "forbid",
    );
  });

  it("forbids every path, public or not, without a valid identity", () => {
    for (const pathname of ["/", "/login", "/api/auth/login/options"]) {
      expect(
        decideGate({ headers: new Headers(), pathname, hasSessionCookie: true }, config),
      ).toEqual({
        kind: "forbid",
      });
    }
  });

  it("sends identified visitors without a session cookie to login", () => {
    expect(decideGate({ headers: me, pathname: "/", hasSessionCookie: false }, config)).toEqual({
      kind: "login",
    });
  });

  it("answers API calls without a session cookie as unauthenticated, not with a redirect", () => {
    for (const pathname of ["/api/devices/remove", "/api/devices/setup-link"]) {
      expect(decideGate({ headers: me, pathname, hasSessionCookie: false }, config)).toEqual({
        kind: "unauthenticated",
      });
    }
  });

  it("still forbids API calls without an identity", () => {
    expect(
      decideGate(
        { headers: new Headers(), pathname: "/api/devices/remove", hasSessionCookie: false },
        config,
      ),
    ).toEqual({ kind: "forbid" });
  });

  it("lets identified visitors reach public auth paths without a session", () => {
    for (const pathname of ["/login", "/setup", "/api/auth/login/options"]) {
      expect(decideGate({ headers: me, pathname, hasSessionCookie: false }, config).kind).toBe(
        "next",
      );
    }
  });

  it("does not treat look-alike paths as public", () => {
    expect(
      decideGate({ headers: me, pathname: "/loginx", hasSessionCookie: false }, config).kind,
    ).toBe("login");
  });

  it("passes identified visitors with a session cookie", () => {
    expect(
      decideGate({ headers: me, pathname: "/design", hasSessionCookie: true }, config),
    ).toEqual({
      kind: "next",
      login: "owner@example.com",
    });
  });
});

describe("app-install assets", () => {
  it.each(["/manifest.webmanifest", "/icon", "/apple-icon", "/icons/192", "/icons/maskable-512"])(
    "%s needs Tailscale identity but no session",
    (pathname) => {
      expect(decideGate({ headers: me, pathname, hasSessionCookie: false }, config).kind).toBe(
        "next",
      );
      expect(
        decideGate({ headers: new Headers(), pathname, hasSessionCookie: false }, config),
      ).toEqual({
        kind: "forbid",
      });
    },
  );

  it("does not open look-alike paths", () => {
    expect(
      decideGate({ headers: me, pathname: "/iconsx", hasSessionCookie: false }, config).kind,
    ).not.toBe("next");
  });
});
