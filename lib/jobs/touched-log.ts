import { appendFileSync, closeSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { isOutsideBrain, type Touched, UNKNOWN_TOUCH } from "@/lib/agents/attribution";
import { touchedPath } from "./run-paths";

/*
 * The touched-path sidecar (`job-<id>.touched`, next to the marker) lists the brain paths the
 * agent wrote, one JSON string per line, so recovery can leave the owner's own edits alone.
 * It is trusted only once sealed after the agent's output was fully read: a worker that died
 * mid-run may have missed the last writes. `"*"`, a damaged file or no seal means "unknown".
 */
const SEAL = JSON.stringify({ sealed: true });
const MAX_TOUCHED_PATHS = 10_000;
const MAX_TOUCHED_BYTES = 2 * 1024 * 1024;

export type TouchedLog = {
  /** Adds a brain-relative path (or UNKNOWN_TOUCH) the agent is about to write. */
  record: (path: string) => void;
  /** Marks the list complete; call only once the agent's output has been fully read. */
  seal: () => void;
  /** What the agent wrote so far, or "all" once that is unknown. */
  touched: () => Touched;
};

/** Appends and fsyncs: once the seal is on disk, so is every path recorded before it. */
function appendDurably(file: string, text: string): void {
  const fd = openSync(file, "a", 0o600);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** The touched-path sidecar of a running job (its marker must already exist). */
export function touchedLog(quarantineRoot: string, jobId: number): TouchedLog {
  const file = touchedPath(quarantineRoot, jobId);
  const paths = new Set<string>();
  let bytes = 0;
  let unknown = false;
  let broken = false; // a line may be missing on disk: never seal
  let outside = false; // a run that tried to write outside the brain is recovered in full
  const append = (line: string) => {
    try {
      appendFileSync(file, `${line}\n`, { mode: 0o600 });
    } catch (error) {
      broken = true;
      console.error(`job ${jobId}: could not record a touched path`, error);
    }
  };
  return {
    record: (path) => {
      if (unknown || paths.has(path)) return;
      const line = JSON.stringify(path);
      bytes += line.length + 1;
      if (path === UNKNOWN_TOUCH || paths.size >= MAX_TOUCHED_PATHS || bytes > MAX_TOUCHED_BYTES) {
        unknown = true;
        append(JSON.stringify(UNKNOWN_TOUCH));
        return;
      }
      if (isOutsideBrain(path)) outside = true;
      paths.add(path);
      append(line);
    },
    seal: () => {
      if (unknown || broken || outside) return;
      try {
        appendDurably(file, `${SEAL}\n`);
      } catch (error) {
        console.error(`job ${jobId}: could not seal the touched paths`, error);
      }
    },
    touched: () => (unknown ? "all" : paths),
  };
}

/** The sealed touched paths of a run, or "all" when they are missing, unsealed or unknown. */
export function readTouched(quarantineRoot: string, jobId: number | string): Touched {
  let lines: string[];
  try {
    lines = readFileSync(touchedPath(quarantineRoot, jobId), "utf8").split("\n").filter(Boolean);
  } catch {
    return "all";
  }
  if (lines.at(-1) !== SEAL) return "all";
  const paths = new Set<string>();
  for (const line of lines.slice(0, -1)) {
    let path: unknown;
    try {
      path = JSON.parse(line);
    } catch {
      return "all";
    }
    if (typeof path !== "string" || path === UNKNOWN_TOUCH || isOutsideBrain(path)) return "all";
    paths.add(path);
  }
  return paths;
}
