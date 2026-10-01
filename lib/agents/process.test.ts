import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTail, runProcess } from "./process";

const FAKE = join(process.cwd(), "tests/fixtures/fake-claude.mjs");

function run(scenario: string, extra: Partial<Parameters<typeof runProcess>[0]> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "harbour-proc-"));
  const lines: string[] = [];
  const promise = runProcess({
    bin: FAKE,
    args: ["-p", "TARGET_FILES: research/a.md"],
    cwd,
    env: { PATH: process.env.PATH ?? "", HOME: cwd, FAKE_CLAUDE_SCENARIO: scenario },
    timeoutMs: 20_000,
    onLine: (l) => lines.push(l),
    shouldCancel: () => false,
    pollMs: 50,
    killGraceMs: 500,
    ...extra,
  });
  return { cwd, lines, promise, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

describe("runProcess", () => {
  it("streams lines and reports a clean exit", async () => {
    const r = run("success");
    try {
      const outcome = await r.promise;
      expect(outcome).toMatchObject({ exitCode: 0, timedOut: false, cancelled: false });
      expect(r.lines.some((l) => l.includes('"type":"result"'))).toBe(true);
    } finally {
      r.cleanup();
    }
  });

  it("kills the process group on timeout", async () => {
    const r = run("slow", { timeoutMs: 300 });
    try {
      const outcome = await r.promise;
      expect(outcome.timedOut).toBe(true);
      expect(outcome.exitCode).not.toBe(0);
    } finally {
      r.cleanup();
    }
  });

  it("stops when cancellation is requested", async () => {
    let cancel = false;
    const r = run("slow", { shouldCancel: () => cancel });
    setTimeout(() => {
      cancel = true;
    }, 200);
    try {
      expect((await r.promise).cancelled).toBe(true);
    } finally {
      r.cleanup();
    }
  });

  it("rejects when the binary cannot start", async () => {
    await expect(
      runProcess({
        bin: "/nonexistent/claude",
        args: [],
        cwd: tmpdir(),
        env: {},
        timeoutMs: 1000,
        onLine: () => {},
        shouldCancel: () => false,
      }),
    ).rejects.toThrow(/could not start/i);
  });
});

describe("appendTail", () => {
  it("keeps only the last max characters", () => {
    expect(appendTail("abc", "defg", 5)).toBe("cdefg");
  });
});
