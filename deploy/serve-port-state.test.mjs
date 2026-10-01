import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./serve-port-state.mjs", import.meta.url));
const PROXY = "http://127.0.0.1:3400";

function run(input, port = "8444") {
  const result = spawnSync("node", [script, port, PROXY], { input, encoding: "utf8" });
  return { code: result.status, out: result.stdout.trim(), err: result.stderr.trim() };
}

const oursConfig = {
  TCP: { 8444: { HTTPS: true } },
  Web: { "host.ts.net:8444": { Handlers: { "/": { Proxy: PROXY } } } },
};

describe("serve-port-state", () => {
  it("reports free for empty status", () => {
    expect(run("{}")).toMatchObject({ code: 0, out: "free" });
  });
  it("reports ours for a matching proxy", () => {
    expect(run(JSON.stringify(oursConfig))).toMatchObject({ code: 0, out: "ours" });
  });
  it("reports taken for another proxy", () => {
    const other = structuredClone(oursConfig);
    other.Web["host.ts.net:8444"].Handlers["/"].Proxy = "http://127.0.0.1:9";
    const r = run(JSON.stringify(other));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^taken:/);
  });
  it("treats a Funnel-enabled port as taken even when otherwise ours", () => {
    const r = run(JSON.stringify({ ...oursConfig, AllowFunnel: { "host.ts.net:8444": true } }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^taken:/);
  });
  it("ignores a disabled Funnel entry", () => {
    const r = run(JSON.stringify({ ...oursConfig, AllowFunnel: { "host.ts.net:8444": false } }));
    expect(r).toMatchObject({ code: 0, out: "ours" });
  });
  it("reports taken for a foreground session using the port", () => {
    const r = run(JSON.stringify({ Foreground: { abc: { TCP: { 8444: { HTTPS: true } } } } }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^taken:/);
  });
  it("reports ours for a foreground session proxying to Harbour", () => {
    expect(run(JSON.stringify({ Foreground: { abc: oursConfig } }))).toMatchObject({
      code: 0,
      out: "ours",
    });
  });
  it("exits 2 with a stderr message on invalid JSON", () => {
    const r = run("not json");
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/Could not parse/);
  });
});
