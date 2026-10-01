import { parseConfig } from "@/lib/config";
import { decideGate } from "./gate";

const config = parseConfig({
  NODE_ENV: "production",
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://pc.tail.ts.net",
  HARBOUR_RP_ID: "pc.tail.ts.net",
});
const me = new Headers({ "Tailscale-User-Login": "owner@example.com" });

describe("decideGate", () => {
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
