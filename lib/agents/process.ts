import { type ChildProcessByStdio, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

export const TAIL_BYTES = 16_384;

export type RunOptions = {
  bin: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  onLine: (line: string) => void;
  shouldCancel: () => boolean;
  pollMs?: number;
  killGraceMs?: number;
};

export type RunOutcome = {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  stdoutTail: string;
  stderrTail: string;
};

/** Keeps the last `max` characters of a growing log. */
export function appendTail(tail: string, chunk: string, max: number): string {
  const next = tail + chunk;
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Runs a command in its own process group; timeout and cancel stop the whole group. */
export function runProcess(options: RunOptions): Promise<RunOutcome> {
  const { pollMs = 2000, killGraceMs = 10_000 } = options;
  return new Promise((resolve, reject) => {
    const child: ChildProcessByStdio<null, Readable, Readable> = spawn(options.bin, options.args, {
      cwd: options.cwd,
      env: options.env as NodeJS.ProcessEnv, // Next augments ProcessEnv with NODE_ENV; the child env is explicit
      detached: true, // new process group, so we can signal every descendant
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutTail = "";
    let stderrTail = "";
    let timedOut = false;
    let cancelled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const stopGroup = () => {
      if (child.pid === undefined || killTimer) return;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
      killTimer = setTimeout(() => {
        try {
          if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        } catch {
          // already gone
        }
      }, killGraceMs);
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      stopGroup();
    }, options.timeoutMs);
    const poll = setInterval(() => {
      if (!cancelled && options.shouldCancel()) {
        cancelled = true;
        stopGroup();
      }
    }, pollMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutTail = appendTail(stdoutTail, chunk, TAIL_BYTES);
    });
    child.stderr.on("data", (chunk: string) => {
      stderrTail = appendTail(stderrTail, chunk, TAIL_BYTES);
    });
    createInterface({ input: child.stdout }).on("line", options.onLine);

    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(poll);
      if (killTimer) clearTimeout(killTimer);
    };
    child.on("error", (error) => {
      cleanup();
      reject(new Error(`Agent CLI could not start (${options.bin}): ${error.message}`));
    });
    child.on("close", (exitCode, signal) => {
      cleanup();
      resolve({ exitCode, signal, timedOut, cancelled, stdoutTail, stderrTail });
    });
  });
}
