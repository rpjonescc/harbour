import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { assertBrainRepoRoot, discardRun, type RunSnapshot } from "@/lib/agents/brain-git";

/**
 * A run marker is the durable copy of an agent run's snapshot, written before the agent starts
 * and removed only once its changes are committed or discarded. A marker that outlives its run
 * (worker crash, failed discard) means the brain may hold unreviewed agent changes: autosave and
 * new runs stay blocked until recovery discards them into quarantine.
 */

const MARKER = /^job-(\d+)\.json$/;

const markerSchema = z.object({
  jobId: z.number().int(),
  ignored: z.array(
    z.tuple([z.string(), z.object({ size: z.number(), mtimeMs: z.number(), ino: z.number() })]),
  ),
  nestedGit: z.array(z.tuple([z.string(), z.number()])),
  gitMeta: z.array(z.tuple([z.string(), z.string()])),
  gitRestore: z.array(z.tuple([z.string(), z.string()])),
});

const activeDir = (quarantineRoot: string) => join(quarantineRoot, "active");
const markerPath = (quarantineRoot: string, jobId: number | string) =>
  join(activeDir(quarantineRoot), `job-${jobId}.json`);

/** Durably records a run's snapshot (tmp file, fsync, rename) in a private folder. */
export function writeRunMarker(quarantineRoot: string, jobId: number, snapshot: RunSnapshot): void {
  const dir = activeDir(quarantineRoot);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const body = JSON.stringify({
    jobId,
    ignored: [...snapshot.ignored],
    nestedGit: [...snapshot.nestedGit],
    gitMeta: [...snapshot.gitMeta],
    gitRestore: [...snapshot.gitRestore].map(([path, data]) => [path, data.toString("base64")]),
  });
  const final = markerPath(quarantineRoot, jobId);
  const tmp = `${final}.tmp`;
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, final);
  const dirFd = openSync(dir, "r");
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

export function removeRunMarker(quarantineRoot: string, jobId: number | string): void {
  rmSync(markerPath(quarantineRoot, jobId), { force: true });
}

/** Ids of jobs whose changes still need recovering, oldest first. Empty when there are none. */
export function pendingRecovery(quarantineRoot: string): string[] {
  let names: string[];
  try {
    names = readdirSync(activeDir(quarantineRoot));
  } catch {
    return [];
  }
  return names
    .map((name) => MARKER.exec(name)?.[1])
    .filter((id): id is string => id !== undefined)
    .sort((a, b) => Number(a) - Number(b));
}

function readRunMarker(quarantineRoot: string, jobId: string): RunSnapshot {
  const raw = markerSchema.parse(
    JSON.parse(readFileSync(markerPath(quarantineRoot, jobId), "utf8")),
  );
  return {
    ignored: new Map(raw.ignored),
    nestedGit: new Map(raw.nestedGit),
    gitMeta: new Map(raw.gitMeta),
    gitRestore: new Map(raw.gitRestore.map(([path, data]) => [path, Buffer.from(data, "base64")])),
  };
}

/** `job-<id>`, or `job-<id>-2`, `-3`… when that name is taken by anything but an empty folder. */
export function freshQuarantineDir(quarantineRoot: string, jobId: number | string): string {
  for (let n = 1; ; n++) {
    const dir = join(quarantineRoot, n === 1 ? `job-${jobId}` : `job-${jobId}-${n}`);
    if (!existsSync(dir)) return dir;
    if (statSync(dir).isDirectory() && readdirSync(dir).length === 0) return dir;
  }
}

export type RecoveryResult = {
  recovered: { jobId: string; dir: string; quarantined: string[] }[];
  failed: { jobId: string; error: string }[];
};

/** Discards every interrupted run's changes into quarantine; markers are removed only on success. */
export function recoverRuns(root: string, quarantineRoot: string): RecoveryResult {
  const result: RecoveryResult = { recovered: [], failed: [] };
  const pending = pendingRecovery(quarantineRoot);
  try {
    if (pending.length > 0) assertBrainRepoRoot(root);
  } catch (error) {
    result.failed = pending.map((jobId) => ({ jobId, error: (error as Error).message }));
    return result;
  }
  for (const jobId of pending) {
    try {
      const snapshot = readRunMarker(quarantineRoot, jobId);
      const dir = freshQuarantineDir(quarantineRoot, jobId);
      const { quarantined } = discardRun(root, snapshot, dir);
      removeRunMarker(quarantineRoot, jobId);
      result.recovered.push({ jobId, dir, quarantined });
    } catch (error) {
      result.failed.push({ jobId, error: (error as Error).message });
    }
  }
  return result;
}
