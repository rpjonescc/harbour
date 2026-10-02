import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  it("delivers a stdin prompt to the child", async () => {
    const r = run("content-work", {
      args: ["-p", "--output-format", "stream-json"],
      stdin: "TARGET_FILES: content/work/7.json\nSTEP: probe\n",
      env: {
        PATH: process.env.PATH ?? "",
        FAKE_CLAUDE_SCENARIO: "content-work",
        FAKE_CLAUDE_WORKS: JSON.stringify({ probe: { ok: true } }),
      },
    });
    try {
      const outcome = await r.promise;
      expect(outcome.exitCode).toBe(0);
      expect(readFileSync(join(r.cwd, "content/work/7.json"), "utf8")).toBe('{"ok":true}');
    } finally {
      r.cleanup();
    }
  });

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

  it("survives a throwing shouldCancel by stopping the run", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = run("slow", {
      shouldCancel: () => {
        throw new Error("db down");
      },
    });
    try {
      expect((await r.promise).cancelled).toBe(true);
      expect(errors).toHaveBeenCalled();
    } finally {
      errors.mockRestore();
      r.cleanup();
    }
  });

  it("keeps consuming output when onLine throws", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const r = run("success", {
      onLine: () => {
        calls += 1;
        if (calls === 1) throw new Error("boom");
      },
    });
    try {
      expect(await r.promise).toMatchObject({ exitCode: 0 });
      expect(calls).toBeGreaterThan(1);
    } finally {
      errors.mockRestore();
      r.cleanup();
    }
  });

  it("does not report both timedOut and cancelled", async () => {
    const r = run("slow", { timeoutMs: 100, shouldCancel: () => true, pollMs: 5000 });
    try {
      const o = await r.promise;
      expect(o.timedOut && o.cancelled).toBe(false);
    } finally {
      r.cleanup();
    }
  });

  it.each([
    ["spawn-grandchild", 20_000],
    ["spawn-grandchild-ignore", 20_000], // SIGTERM ignored: only the SIGKILL sweep can end it
  ])("leaves no grandchild behind (%s)", async (scenario, killGraceMs) => {
    const r = run(scenario, { timeoutMs: 1500, killGraceMs });
    try {
      const outcome = await r.promise;
      expect(outcome.timedOut).toBe(true);
      expect(outcome.signal).not.toBeNull();
      const pidFile = join(r.cwd, "grandchild.pid");
      expect(existsSync(pidFile)).toBe(true);
      const pid = Number(readFileSync(pidFile, "utf8"));
      let alive = true;
      for (let i = 0; i < 40 && alive; i++) {
        try {
          process.kill(pid, 0);
          await new Promise((res) => setTimeout(res, 50));
        } catch {
          alive = false;
        }
      }
      if (alive) process.kill(pid, "SIGKILL"); // never leak, even when failing
      expect(alive).toBe(false);
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

  it("does not truncate below the limit or at the exact boundary", () => {
    expect(appendTail("ab", "c", 5)).toBe("abc");
    expect(appendTail("ab", "cde", 5)).toBe("abcde");
  });
});
