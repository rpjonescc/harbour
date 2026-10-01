import { parseConfig } from "@/lib/config";
import { resolveIdentity } from "./tailscale";

const env = {
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://pc.tail.ts.net",
  HARBOUR_RP_ID: "pc.tail.ts.net",
};
const prod = parseConfig({ ...env, NODE_ENV: "production" });
const dev = parseConfig({
  ...env,
  NODE_ENV: "development",
  HARBOUR_DEV_IDENTITY: "owner@example.com",
});

describe("resolveIdentity", () => {
  it("accepts an allowlisted Tailscale login, case-insensitively", () => {
    const headers = new Headers({ "Tailscale-User-Login": "Owner@Example.com" });
    expect(resolveIdentity(headers, prod)).toEqual({ ok: true, login: "owner@example.com" });
  });

  it("rejects a missing header in production", () => {
    expect(resolveIdentity(new Headers(), prod)).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a login that is not allowlisted", () => {
    const headers = new Headers({ "Tailscale-User-Login": "intruder@example.com" });
    expect(resolveIdentity(headers, prod)).toEqual({ ok: false, reason: "not-allowed" });
  });

  it("uses the dev identity only when no header is present outside production", () => {
    expect(resolveIdentity(new Headers(), dev)).toEqual({ ok: true, login: "owner@example.com" });
    const spoof = new Headers({ "Tailscale-User-Login": "intruder@example.com" });
    expect(resolveIdentity(spoof, dev)).toEqual({ ok: false, reason: "not-allowed" });
  });
});
