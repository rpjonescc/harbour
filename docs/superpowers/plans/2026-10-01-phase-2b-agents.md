# Harbour Phase 2b (Agents) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A background worker runs locked-down headless Claude agents that write cited research and product discovery into the private Second Brain, with live activity, cancel, a commit-and-push gate, and approval screens for proposed keywords, AI questions and competitors.

**Architecture:** The web app only enqueues and cancels jobs (SQLite `jobs` table). A separate `harbour-worker` process (systemd user service, `tsx`) claims one job at a time, spawns `claude -p` with a fixed minimal tool set and no user settings/plugins/hooks/MCP, summarises its `stream-json` output into `agent_run_events`, then a git gate keeps only changes inside the job's allowed area, commits them to the brain repo and pushes. Discovery output (`proposals.json`) is validated with zod and imported as `proposed` rows the owner approves in Settings.

**Tech Stack:** Next.js 16, TypeScript 6, Drizzle + better-sqlite3, zod 4, Node `child_process` (process groups), git CLI, Claude Code CLI (`claude -p`), tsx, Vitest 5, Playwright 1.63, lefthook.

**Spec:** `docs/superpowers/specs/2026-10-01-phase-2-second-brain-design.md` Part 2b (B1–B6). **Repo rules:** `AGENTS.md`.

## Global Constraints

- Public repo: never commit personal data. Tests/fixtures use fictional products (`acme-docs`, "Acme Docs", `example.com`).
- The web process never spawns agents; it only inserts jobs / sets `cancel_requested`. Worker code must not import any module that imports `"server-only"` (`lib/auth/guard.ts`, `lib/brain/runtime.ts`, `lib/brain/view-model.ts`), because plain Node throws on it.
- Agent CLI invocation is exactly the `claudeArgs()` of Task 2: tools `Read,Write,Edit,Glob,Grep,WebSearch,WebFetch` (no Bash) but ONLY `WebSearch,WebFetch` pre-approved via `--allowed-tools` — pre-approving file tools would allow them anywhere on the machine (verified live: an unscoped `Write` allowance wrote outside the brain). With `--permission-mode acceptEdits` and no file-tool allowances, Claude Code permits file reads/edits only inside the working directory (the brain) and denies everything else in headless mode (verified live for Read, Write, Edit, Grep, Glob). `--setting-sources ""`, `--settings {"disableAllHooks":true}`, `--disable-slash-commands`, `--strict-mcp-config --mcp-config {"mcpServers":{}}`, `--no-session-persistence`, `--output-format stream-json --verbose`, `--model` from config. Environment is ONLY `HOME`, `PATH`, `CLAUDE_CODE_OAUTH_TOKEN`.
- `HARBOUR_CLAUDE_OAUTH_TOKEN` is a secret: server/worker only, never rendered, logged, audited or stored in the DB. UI shows only "set / not set".
- One agent job at a time. Heartbeat 10 s; stale after 60 s. Cancel/timeout: SIGTERM to the process group, SIGKILL after 10 s. Default timeout 30 min (`HARBOUR_AGENT_TIMEOUT_MINUTES`, 1–120). Stdout/stderr tails capped at 16 KiB each; at most 200 events per job.
- Automation (owner requirement — no manual commits or terminal commands): the worker autosaves the owner's brain edits (commit + push) once they have been quiet for 2 minutes, saves them automatically before any agent run, and retries unpushed commits automatically every 10 minutes. Manual buttons are optional extras, never required.
- Git gate: a run may only change files under its allowed paths with extensions `.md` (and `.json` only for `products/<id>/proposals.json`). Any other change fails the run and is restored from git. Before a run starts, any uncommitted owner changes are committed as owner notes (never mixed into the agent commit).
- Every page calls `requireSession()`; every API route checks `getSession()` (401); mutating routes call `rejectCrossSite()` first. Audit agent run requests, cancels and proposal decisions.
- Semantic tokens only; rem text sizes; file-size limits (`.tsx` 300, `.ts` 400, tests 600). README updated in the same task as settings/commands/features.
- Commits: conventional prefix, the attribution trailer your environment specifies, never `--no-verify`. Never `pkill`/`killall`. Do not run `deploy/install.sh`, `systemctl` or `tailscale` (the controller deploys).
- `pnpm check` before each commit.
- Biome forbids non-null assertions (`!`), including in tests. Test snippets below use `x!` for brevity: replace each with a guard (`if (!x) throw new Error("expected …")`) or optional chaining when writing the file.
- UI components described in prose (Tasks 8–9) follow the existing component patterns (`components/brain/*`, `components/settings/*`): semantic tokens, accessible names, `role="alert"` errors, `postJson` for mutations, `router.refresh()` after success.

## File Structure

```
lib/config.ts                         + HARBOUR_CLAUDE_BIN, HARBOUR_CLAUDE_OAUTH_TOKEN, HARBOUR_AGENT_MODEL, HARBOUR_AGENT_TIMEOUT_MINUTES
lib/db/schema.ts                      + jobs, agentRuns, agentRunEvents, proposals
lib/jobs/queue.ts (+test)             enqueue (deduped), claim, heartbeat, finish, cancel, recover, list, events
lib/agents/stream.ts (+test)          stream-json line → events/result
lib/agents/claude-args.ts (+test)     exact CLI args + minimal env
lib/agents/process.ts (+test)         spawn in process group, tails, timeout, cancel
lib/agents/brain-git.ts (+test)       status, partition, restore, commit, push, unpushed count
lib/agents/topics.ts                  the 10 research topics
lib/agents/prompts.ts (+test)         research + discovery prompt builders (versioned)
lib/agents/specs.ts (+test)           job → spec (allowed paths, prompt, timeout)
lib/agents/proposals.ts (+test)       schema, import (no overwrite), list, decide, edit, approve-all
lib/jobs/run-job.ts (+test)           orchestration with injected deps
worker/index.ts                       loop: recover, claim, heartbeat, run
tests/fixtures/fake-claude.mjs        fake CLI for tests/E2E
app/api/agents/run|[id]|[id]/cancel|brain-push, app/api/products/[id]/proposals
app/(app)/agents/page.tsx, [id]/page.tsx; components/agents/*
app/(app)/settings/products/[id]/page.tsx; components/proposals/*
deploy/harbour-worker.service.template, deploy/install.sh, README.md, deploy/README.md, .env.example
tests/e2e/prepare.ts, tests/e2e/agents.spec.ts
```

---

### Task 1: Config, schema and job queue

**Files:**
- Modify: `lib/config.ts`, `lib/config.test.ts`, `lib/db/schema.ts`, `lib/audit.ts`
- Create: `drizzle/0004_agents.sql` (generated), `lib/jobs/queue.ts`, `lib/jobs/queue.test.ts`

**Interfaces:**
- Produces:
  - config: `HARBOUR_CLAUDE_BIN: string` (default `"claude"`), `HARBOUR_CLAUDE_OAUTH_TOKEN?: string`, `HARBOUR_AGENT_MODEL: string` (default `"claude-sonnet-5-5"`), `HARBOUR_AGENT_TIMEOUT_MINUTES: number` (default 30, int 1–120)
  - `AuditEvent` adds `"agent_run_requested" | "agent_run_cancelled" | "proposal_decided"`
  - tables `jobs`, `agentRuns`, `agentRunEvents`, `proposals` (see Step 3)
  - `type JobKind = "research" | "discovery" | "brain-push" | "notes-sync"`; `type JobStatus = "queued" | "running" | "ok" | "failed" | "cancelled"`; `type Job = typeof jobs.$inferSelect`
  - `enqueueJob(db, kind, params: Record<string, string>, requestedBy: string | null, now?): { id: number; created: boolean }`
  - `claimNextJob(db, now?): Job | null`; `heartbeat(db, id, now?)`; `finishJob(db, id, status: "ok" | "failed" | "cancelled", error: string | null, now?)`
  - `requestCancel(db, id, now?): "cancelled" | "requested" | "not-active"`; `isCancelRequested(db, id): boolean`
  - `recoverStaleJobs(db, now?, staleMs?): number`
  - `listJobs(db, limit?): Job[]`; `getJob(db, id): Job | undefined`
  - `MAX_EVENTS = 200`; `addEvent(db, jobId, kind: EventKind, text: string, now?)`; `type EventKind = "status" | "tool" | "text" | "error"`; `eventsSince(db, jobId, afterId): { id: number; at: Date; kind: EventKind; text: string }[]`

- [ ] **Step 1: Failing config tests — append to `lib/config.test.ts`** (reuse its `base`)

```ts
describe("agent settings", () => {
  it("defaults the CLI, model and timeout, and leaves the token unset", () => {
    const c = parseConfig(base);
    expect(c.HARBOUR_CLAUDE_BIN).toBe("claude");
    expect(c.HARBOUR_AGENT_MODEL).toBe("claude-sonnet-5-5");
    expect(c.HARBOUR_AGENT_TIMEOUT_MINUTES).toBe(30);
    expect(c.HARBOUR_CLAUDE_OAUTH_TOKEN).toBeUndefined();
  });
  it("bounds the timeout", () => {
    expect(() => parseConfig({ ...base, HARBOUR_AGENT_TIMEOUT_MINUTES: "0" })).toThrow();
    expect(() => parseConfig({ ...base, HARBOUR_AGENT_TIMEOUT_MINUTES: "121" })).toThrow();
    expect(parseConfig({ ...base, HARBOUR_AGENT_TIMEOUT_MINUTES: "5" }).HARBOUR_AGENT_TIMEOUT_MINUTES).toBe(5);
  });
});
```

- [ ] **Step 2: Implement config** — add to the schema object in `lib/config.ts`:

```ts
    HARBOUR_CLAUDE_BIN: z.string().min(1).default("claude"),
    // Secret: long-lived subscription token from `claude setup-token`. Worker only.
    HARBOUR_CLAUDE_OAUTH_TOKEN: z.string().min(1).optional(),
    // Full model id (aliases like "sonnet" can resolve to an older model).
    HARBOUR_AGENT_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
    HARBOUR_AGENT_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(30),
```
Run: `pnpm vitest run lib/config.test.ts` → PASS.

- [ ] **Step 3: Schema — append to `lib/db/schema.ts`** (add `uniqueIndex` to the sqlite-core import)

```ts
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["research", "discovery", "brain-push", "notes-sync"] }).notNull(),
  params: text("params", { mode: "json" }).$type<Record<string, string>>().notNull(),
  // Stable identity of the request, used to avoid queueing the same job twice.
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status", { enum: ["queued", "running", "ok", "failed", "cancelled"] }).notNull(),
  requestedBy: text("requested_by"),
  createdAt: timestamp("created_at").notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  heartbeatAt: timestamp("heartbeat_at"),
  cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
  error: text("error"),
});

export const agentRuns = sqliteTable("agent_runs", {
  jobId: integer("job_id").primaryKey().references(() => jobs.id),
  promptVersion: text("prompt_version").notNull(),
  exitCode: integer("exit_code"),
  filesChanged: text("files_changed", { mode: "json" }).$type<string[]>(),
  commitSha: text("commit_sha"),
  pushed: integer("pushed", { mode: "boolean" }),
  stdoutTail: text("stdout_tail"),
  stderrTail: text("stderr_tail"),
});

export const agentRunEvents = sqliteTable("agent_run_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  at: timestamp("at").notNull(),
  kind: text("kind", { enum: ["status", "tool", "text", "error"] }).notNull(),
  text: text("text").notNull(),
});

export const proposals = sqliteTable(
  "proposals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id").notNull(),
    type: text("type", { enum: ["keyword", "question", "competitor"] }).notNull(),
    value: text("value", { mode: "json" }).$type<Record<string, string>>().notNull(),
    // Normalised identity (e.g. lower-cased term) so re-runs don't duplicate items.
    key: text("key").notNull(),
    why: text("why").notNull(),
    status: text("status", { enum: ["proposed", "approved", "rejected"] }).notNull(),
    edited: integer("edited", { mode: "boolean" }).notNull().default(false),
    sourceJobId: integer("source_job_id").references(() => jobs.id),
    createdAt: timestamp("created_at").notNull(),
    decidedAt: timestamp("decided_at"),
  },
  (t) => [uniqueIndex("proposals_product_type_key").on(t.productId, t.type, t.key)],
);
```

Run: `pnpm db:generate --name agents` → `drizzle/0004_agents.sql` with 4 tables and the unique index.

`lib/audit.ts`: add `| "agent_run_requested" | "agent_run_cancelled" | "proposal_decided"` to `AuditEvent`.

- [ ] **Step 4: Failing queue tests `lib/jobs/queue.test.ts`**

```ts
import { openTestDb } from "@/tests/helpers/db";
import {
  addEvent, claimNextJob, enqueueJob, eventsSince, finishJob, getJob, heartbeat,
  isCancelRequested, listJobs, MAX_EVENTS, recoverStaleJobs, requestCancel,
} from "./queue";

const t0 = new Date("2026-10-01T00:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

describe("job queue", () => {
  it("dedupes identical active requests but allows new ones after finishing", () => {
    const db = openTestDb();
    const a = enqueueJob(db, "research", { topic: "glossary" }, "owner@example.com", t0);
    const b = enqueueJob(db, "research", { topic: "glossary" }, "owner@example.com", t0);
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    const claimed = claimNextJob(db, t0);
    finishJob(db, claimed!.id, "ok", null, at(1));
    expect(enqueueJob(db, "research", { topic: "glossary" }, null, at(2)).created).toBe(true);
  });

  it("claims oldest first, exactly once", () => {
    const db = openTestDb();
    const first = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    enqueueJob(db, "research", { topic: "b" }, null, at(1));
    const job = claimNextJob(db, at(2));
    expect(job?.id).toBe(first);
    expect(job?.status).toBe("running");
    expect(job?.startedAt).toEqual(at(2));
    expect(claimNextJob(db, at(3))?.id).not.toBe(first);
    expect(claimNextJob(db, at(4))).toBeNull();
  });

  it("cancels queued jobs immediately and flags running ones", () => {
    const db = openTestDb();
    const queued = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    expect(requestCancel(db, queued, at(1))).toBe("cancelled");
    expect(getJob(db, queued)?.status).toBe("cancelled");
    const running = enqueueJob(db, "research", { topic: "b" }, null, t0).id;
    claimNextJob(db, at(1));
    expect(requestCancel(db, running, at(2))).toBe("requested");
    expect(isCancelRequested(db, running)).toBe(true);
    finishJob(db, running, "cancelled", null, at(3));
    expect(requestCancel(db, running, at(4))).toBe("not-active");
  });

  it("fails running jobs whose heartbeat went stale", () => {
    const db = openTestDb();
    const id = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    claimNextJob(db, t0);
    heartbeat(db, id, at(10_000));
    expect(recoverStaleJobs(db, at(30_000))).toBe(0);
    expect(recoverStaleJobs(db, at(80_000))).toBe(1);
    expect(getJob(db, id)).toMatchObject({ status: "failed", error: expect.stringMatching(/worker stopped/i) });
  });

  it("caps events per job with one final note", () => {
    const db = openTestDb();
    const id = enqueueJob(db, "research", { topic: "a" }, null, t0).id;
    for (let i = 0; i < MAX_EVENTS + 20; i++) addEvent(db, id, "tool", `e${i}`, t0);
    const events = eventsSince(db, id, 0);
    expect(events).toHaveLength(MAX_EVENTS + 1);
    expect(events.at(-1)?.text).toMatch(/limit/i);
    expect(eventsSince(db, id, events[9]!.id)).toHaveLength(MAX_EVENTS + 1 - 10);
  });

  it("lists newest first", () => {
    const db = openTestDb();
    enqueueJob(db, "research", { topic: "a" }, null, t0);
    const newer = enqueueJob(db, "research", { topic: "b" }, null, at(1)).id;
    expect(listJobs(db)[0]?.id).toBe(newer);
  });
});
```

- [ ] **Step 5: Run to verify failure** — `pnpm vitest run lib/jobs` → FAIL.

- [ ] **Step 6: Implement `lib/jobs/queue.ts`**

```ts
import { and, asc, count, desc, eq, gt, inArray, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { agentRunEvents, jobs } from "@/lib/db/schema";

export type JobKind = "research" | "discovery" | "brain-push" | "notes-sync";
export type JobStatus = "queued" | "running" | "ok" | "failed" | "cancelled";
export type Job = typeof jobs.$inferSelect;
export type EventKind = "status" | "tool" | "text" | "error";

export const MAX_EVENTS = 200;
const STALE_MS = 60_000;

function dedupeKeyFor(kind: JobKind, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort().map((k) => [k, params[k]]);
  return `${kind}:${JSON.stringify(sorted)}`;
}

/** Queues a job unless an identical one is already queued or running. */
export function enqueueJob(
  db: Db,
  kind: JobKind,
  params: Record<string, string>,
  requestedBy: string | null,
  now = new Date(),
): { id: number; created: boolean } {
  const dedupeKey = dedupeKeyFor(kind, params);
  return db.transaction((tx) => {
    const active = tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.dedupeKey, dedupeKey), inArray(jobs.status, ["queued", "running"])))
      .get();
    if (active) return { id: active.id, created: false };
    const row = tx
      .insert(jobs)
      .values({ kind, params, dedupeKey, status: "queued", requestedBy, createdAt: now })
      .returning({ id: jobs.id })
      .get();
    return { id: row.id, created: true };
  });
}

/** Atomically moves the oldest queued job to running. */
export function claimNextJob(db: Db, now = new Date()): Job | null {
  return db.transaction((tx) => {
    const next = tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "queued")).orderBy(asc(jobs.id)).get();
    if (!next) return null;
    return (
      tx
        .update(jobs)
        .set({ status: "running", startedAt: now, heartbeatAt: now })
        .where(and(eq(jobs.id, next.id), eq(jobs.status, "queued")))
        .returning()
        .get() ?? null
    );
  });
}

export function heartbeat(db: Db, id: number, now = new Date()): void {
  db.update(jobs).set({ heartbeatAt: now }).where(and(eq(jobs.id, id), eq(jobs.status, "running"))).run();
}

export function finishJob(
  db: Db,
  id: number,
  status: "ok" | "failed" | "cancelled",
  error: string | null,
  now = new Date(),
): void {
  db.update(jobs).set({ status, error, finishedAt: now }).where(eq(jobs.id, id)).run();
}

/** Queued jobs are cancelled at once; running jobs are flagged for the worker. */
export function requestCancel(db: Db, id: number, now = new Date()): "cancelled" | "requested" | "not-active" {
  const job = getJob(db, id);
  if (job?.status === "queued") {
    finishJob(db, id, "cancelled", null, now);
    return "cancelled";
  }
  if (job?.status === "running") {
    db.update(jobs).set({ cancelRequested: true }).where(eq(jobs.id, id)).run();
    return "requested";
  }
  return "not-active";
}

export function isCancelRequested(db: Db, id: number): boolean {
  return db.select({ c: jobs.cancelRequested }).from(jobs).where(eq(jobs.id, id)).get()?.c === true;
}

/** Marks running jobs with a stale heartbeat as failed (the worker died mid-run). */
export function recoverStaleJobs(db: Db, now = new Date(), staleMs = STALE_MS): number {
  const cutoff = new Date(now.getTime() - staleMs);
  return db
    .update(jobs)
    .set({
      status: "failed",
      finishedAt: now,
      error: "Worker stopped during run — check the brain repo for partial changes (git status)",
    })
    .where(and(eq(jobs.status, "running"), lt(jobs.heartbeatAt, cutoff)))
    .returning({ id: jobs.id })
    .all().length;
}

export function listJobs(db: Db, limit = 30): Job[] {
  return db.select().from(jobs).orderBy(desc(jobs.id)).limit(limit).all();
}

export function getJob(db: Db, id: number): Job | undefined {
  return db.select().from(jobs).where(eq(jobs.id, id)).get();
}

/** Appends an activity line, keeping at most MAX_EVENTS plus one "limit reached" note. */
export function addEvent(db: Db, jobId: number, kind: EventKind, text: string, now = new Date()): void {
  const n = db.select({ n: count() }).from(agentRunEvents).where(eq(agentRunEvents.jobId, jobId)).get()?.n ?? 0;
  if (n > MAX_EVENTS) return;
  const value =
    n === MAX_EVENTS
      ? { jobId, at: now, kind: "status" as const, text: "Activity limit reached — further steps not recorded" }
      : { jobId, at: now, kind, text: text.slice(0, 500) };
  db.insert(agentRunEvents).values(value).run();
}

export function eventsSince(db: Db, jobId: number, afterId: number) {
  return db
    .select({ id: agentRunEvents.id, at: agentRunEvents.at, kind: agentRunEvents.kind, text: agentRunEvents.text })
    .from(agentRunEvents)
    .where(and(eq(agentRunEvents.jobId, jobId), gt(agentRunEvents.id, afterId)))
    .orderBy(asc(agentRunEvents.id))
    .all();
}
```

- [ ] **Step 7: Run, gate, commit**

Run: `pnpm vitest run lib/jobs lib/config.test.ts && pnpm check` → PASS. README: add the four `HARBOUR_*` agent settings to the configuration table (token row says "secret; from `claude setup-token`; required for agents"). `.env.example`: add commented entries (no value for the token):
```bash
# Agents (Phase 2b). Token: run `claude setup-token` and paste the result. Never commit it.
# HARBOUR_CLAUDE_OAUTH_TOKEN=
# HARBOUR_CLAUDE_BIN=claude
# HARBOUR_AGENT_MODEL=claude-sonnet-5-5
# HARBOUR_AGENT_TIMEOUT_MINUTES=30
```
```bash
git add lib drizzle README.md .env.example
git commit -m "feat(agents): job queue, agent tables and settings"
```

---

### Task 2: CLI arguments and stream summariser

**Files:**
- Create: `lib/agents/claude-args.ts`, `lib/agents/claude-args.test.ts`, `lib/agents/stream.ts`, `lib/agents/stream.test.ts`

**Interfaces:**
- Produces: `AGENT_TOOLS`; `claudeArgs(prompt: string, model: string): string[]`; `agentEnv(token: string, home: string, path: string): Record<string, string>`; `type AgentEvent = { kind: "tool" | "text" | "error" | "status"; text: string }`; `type StreamResult = { isError: boolean; text: string }`; `summariseLine(line: string, root: string): { events: AgentEvent[]; result?: StreamResult }`

- [ ] **Step 1: Failing tests**

`lib/agents/claude-args.test.ts`:
```ts
import { AGENT_TOOLS, agentEnv, claudeArgs } from "./claude-args";

describe("claudeArgs", () => {
  const args = claudeArgs("Do the thing", "sonnet");
  const value = (flag: string) => args[args.indexOf(flag) + 1];

  it("runs headless with streaming JSON and the configured model", () => {
    expect(args.slice(0, 2)).toEqual(["-p", "Do the thing"]);
    expect(value("--output-format")).toBe("stream-json");
    expect(args).toContain("--verbose");
    expect(value("--model")).toBe("sonnet");
  });

  it("exposes only the research tools, never a shell", () => {
    expect(value("--tools")).toBe("Read,Write,Edit,Glob,Grep,WebSearch,WebFetch");
    expect(AGENT_TOOLS).not.toContain("Bash");
    expect(value("--permission-mode")).toBe("acceptEdits");
  });

  it("pre-approves only web tools, so file access stays inside the working directory", () => {
    // Pre-approving Read/Write/Edit/Glob/Grep would allow them anywhere on disk.
    expect(value("--allowed-tools")).toBe("WebSearch,WebFetch");
  });

  it("loads no user settings, hooks, skills or MCP servers", () => {
    expect(value("--setting-sources")).toBe("");
    expect(JSON.parse(value("--settings") ?? "")).toEqual({ disableAllHooks: true });
    expect(args).toContain("--disable-slash-commands");
    expect(args).toContain("--strict-mcp-config");
    expect(JSON.parse(value("--mcp-config") ?? "")).toEqual({ mcpServers: {} });
    expect(args).toContain("--no-session-persistence");
  });
});

describe("agentEnv", () => {
  it("passes only home, path and the token", () => {
    expect(agentEnv("tok", "/home/x", "/usr/bin")).toEqual({
      HOME: "/home/x",
      PATH: "/usr/bin",
      CLAUDE_CODE_OAUTH_TOKEN: "tok",
    });
  });
});
```

`lib/agents/stream.test.ts`:
```ts
import { summariseLine } from "./stream";

const root = "/srv/brain";
const line = (o: unknown) => JSON.stringify(o);
const assistant = (content: unknown[]) => line({ type: "assistant", message: { content } });

describe("summariseLine", () => {
  it("describes tool use in plain words with brain-relative paths", () => {
    expect(summariseLine(assistant([{ type: "tool_use", name: "WebSearch", input: { query: "how perplexity cites" } }]), root).events)
      .toEqual([{ kind: "tool", text: "Searching: how perplexity cites" }]);
    expect(summariseLine(assistant([{ type: "tool_use", name: "WebFetch", input: { url: "https://example.com/a" } }]), root).events)
      .toEqual([{ kind: "tool", text: "Reading: https://example.com/a" }]);
    expect(summariseLine(assistant([{ type: "tool_use", name: "Write", input: { file_path: "/srv/brain/research/geo/a.md" } }]), root).events)
      .toEqual([{ kind: "tool", text: "Writing: research/geo/a.md" }]);
    expect(summariseLine(assistant([{ type: "tool_use", name: "Edit", input: { file_path: "/srv/brain/x.md" } }]), root).events)
      .toEqual([{ kind: "tool", text: "Editing: x.md" }]);
  });

  it("skips noisy lookups but keeps short assistant text", () => {
    expect(summariseLine(assistant([{ type: "tool_use", name: "Glob", input: {} }]), root).events).toEqual([]);
    const long = "x".repeat(400);
    const [event] = summariseLine(assistant([{ type: "text", text: long }]), root).events;
    expect(event?.kind).toBe("text");
    expect(event?.text.length).toBeLessThanOrEqual(201);
  });

  it("reports tool errors and API retries", () => {
    const err = line({ type: "user", message: { content: [{ type: "tool_result", is_error: true, content: "Permission denied for ../x" }] } });
    expect(summariseLine(err, root).events).toEqual([{ kind: "error", text: "Tool error: Permission denied for ../x" }]);
    expect(summariseLine(line({ type: "system", subtype: "api_retry" }), root).events).toEqual([{ kind: "status", text: "Retrying the API…" }]);
  });

  it("returns the final result", () => {
    expect(summariseLine(line({ type: "result", subtype: "success", is_error: false, result: "done" }), root).result)
      .toEqual({ isError: false, text: "done" });
    expect(summariseLine(line({ type: "result", subtype: "success", is_error: true, result: "Not logged in" }), root).result)
      .toEqual({ isError: true, text: "Not logged in" });
  });

  it("ignores non-JSON and unknown lines", () => {
    expect(summariseLine("not json", root)).toEqual({ events: [] });
    expect(summariseLine(line({ type: "system", subtype: "init" }), root)).toEqual({ events: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run lib/agents` → FAIL.

- [ ] **Step 3: Implement `lib/agents/claude-args.ts`**

```ts
/** The only tools an agent gets: research and brain file editing. Never a shell. */
export const AGENT_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch"] as const;

// Only web tools are pre-approved. File tools are deliberately NOT listed: in acceptEdits mode
// Claude Code then allows them inside the working directory (the brain) and denies them
// everywhere else. Listing them here would pre-approve them for the whole machine.
const PRE_APPROVED = ["WebSearch", "WebFetch"] as const;

/** Headless Claude Code invocation with no user settings, plugins, hooks, skills or MCP. */
export function claudeArgs(prompt: string, model: string): string[] {
  const tools = AGENT_TOOLS.join(",");
  return [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--model", model,
    "--permission-mode", "acceptEdits",
    "--tools", tools,
    "--allowed-tools", PRE_APPROVED.join(","),
    "--setting-sources", "",
    "--settings", JSON.stringify({ disableAllHooks: true }),
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--mcp-config", JSON.stringify({ mcpServers: {} }),
    "--no-session-persistence",
  ];
}

/** Minimal environment: nothing from the worker's own environment leaks to the agent. */
export function agentEnv(token: string, home: string, path: string): Record<string, string> {
  return { HOME: home, PATH: path, CLAUDE_CODE_OAUTH_TOKEN: token };
}
```

- [ ] **Step 4: Implement `lib/agents/stream.ts`**

```ts
import { relative } from "node:path";

export type AgentEvent = { kind: "tool" | "text" | "error" | "status"; text: string };
export type StreamResult = { isError: boolean; text: string };

type Block = { type?: string; name?: string; input?: Record<string, unknown>; text?: string; is_error?: boolean; content?: unknown };

const clip = (text: string, max = 200) => (text.length > max ? `${text.slice(0, max)}…` : text);
const str = (v: unknown) => (typeof v === "string" ? v : "");

function describeTool(block: Block, root: string): AgentEvent | null {
  const input = block.input ?? {};
  const file = () => relative(root, str(input.file_path)) || str(input.file_path);
  switch (block.name) {
    case "WebSearch":
      return { kind: "tool", text: `Searching: ${clip(str(input.query))}` };
    case "WebFetch":
      return { kind: "tool", text: `Reading: ${clip(str(input.url))}` };
    case "Write":
      return { kind: "tool", text: `Writing: ${file()}` };
    case "Edit":
      return { kind: "tool", text: `Editing: ${file()}` };
    case "Read":
      return { kind: "tool", text: `Opening: ${file()}` };
    default:
      return null; // Glob/Grep and anything else are noise in the activity feed
  }
}

/** One stream-json line → activity events and, for the final line, the run result. */
export function summariseLine(line: string, root: string): { events: AgentEvent[]; result?: StreamResult } {
  let event: { type?: string; subtype?: string; is_error?: boolean; result?: unknown; message?: { content?: Block[] } };
  try {
    event = JSON.parse(line);
  } catch {
    return { events: [] };
  }
  const content = event.message?.content ?? [];
  if (event.type === "assistant") {
    const events: AgentEvent[] = [];
    for (const block of content) {
      if (block.type === "tool_use") {
        const described = describeTool(block, root);
        if (described) events.push(described);
      } else if (block.type === "text" && str(block.text).trim()) {
        events.push({ kind: "text", text: clip(str(block.text).trim()) });
      }
    }
    return { events };
  }
  if (event.type === "user") {
    const events = content
      .filter((block) => block.type === "tool_result" && block.is_error)
      .map((block) => ({ kind: "error" as const, text: `Tool error: ${clip(str(block.content))}` }));
    return { events };
  }
  if (event.type === "system" && event.subtype === "api_retry") {
    return { events: [{ kind: "status", text: "Retrying the API…" }] };
  }
  if (event.type === "result") {
    return { events: [], result: { isError: event.is_error === true || event.subtype !== "success", text: str(event.result) } };
  }
  return { events: [] };
}
```

- [ ] **Step 5: Run, gate, commit**

Run: `pnpm vitest run lib/agents && pnpm check` → PASS.
```bash
git add lib/agents
git commit -m "feat(agents): locked-down CLI arguments and activity summariser"
```

---

### Task 3: Process runner and fake CLI

**Files:**
- Create: `lib/agents/process.ts`, `lib/agents/process.test.ts`, `tests/fixtures/fake-claude.mjs`

**Interfaces:**
- Produces: `type RunOptions = { bin: string; args: string[]; cwd: string; env: Record<string, string>; timeoutMs: number; onLine: (line: string) => void; shouldCancel: () => boolean; pollMs?: number; killGraceMs?: number }`; `type RunOutcome = { exitCode: number | null; signal: string | null; timedOut: boolean; cancelled: boolean; stdoutTail: string; stderrTail: string }`; `TAIL_BYTES = 16384`; `runProcess(options): Promise<RunOutcome>` (rejects only if the binary can't be started); `appendTail(tail: string, chunk: string, max: number): string`.
- Fake CLI behaviour (selected by env `FAKE_CLAUDE_SCENARIO`, default `success`): reads the prompt from argv after `-p`; finds `TARGET_FILES:` line in the prompt (comma-separated brain-relative paths); `success` writes each target (`.md` → a small doc; `proposals.json` → valid sample) and emits init, a WebSearch tool_use, Write tool_uses, and a success result; `slow` emits init then sleeps 60 s (for cancel/timeout); `escape` also writes `outside.md` at the brain root; `fail` emits a result with `is_error: true`; `noop` writes nothing; `bad-json` writes invalid proposals.json.

- [ ] **Step 1: Write `tests/fixtures/fake-claude.mjs`** (then `chmod +x`)

```js
#!/usr/bin/env node
// Fake `claude -p` for tests and E2E. Behaviour chosen by FAKE_CLAUDE_SCENARIO.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? "success";
const prompt = process.argv[process.argv.indexOf("-p") + 1] ?? "";
const targets = (/^TARGET_FILES:\s*(.+)$/m.exec(prompt)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const tool = (name, input) => out({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });

const sampleProposals = {
  keywords: [{ term: "example widgets", intent: "commercial", why: "Core product term" }],
  questions: [{ text: "What is the best example widget?", why: "Common buyer question" }],
  competitors: [{ name: "Example Rival", url: "https://rival.example.com", why: "Ranks for core terms" }],
};

function write(rel, content) {
  const abs = join(process.cwd(), rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  tool("Write", { file_path: abs });
}

out({ type: "system", subtype: "init", tools: ["Read", "Write"] });
if (scenario === "slow") {
  setTimeout(() => out({ type: "result", subtype: "success", is_error: false, result: "late" }), 60_000);
} else if (scenario === "fail") {
  out({ type: "result", subtype: "success", is_error: true, result: "Not logged in" });
} else {
  tool("WebSearch", { query: "fake research query" });
  if (scenario !== "noop") {
    for (const rel of targets) {
      if (rel.endsWith("proposals.json")) {
        write(rel, scenario === "bad-json" ? "{ nope" : JSON.stringify(sampleProposals, null, 2));
      } else {
        write(rel, `---\ntitle: Fake ${rel}\nresearched: 2026-10-01\nconfidence: low\n---\n# Fake ${rel}\n\nWritten by the fake CLI.\n`);
      }
    }
    if (scenario === "escape") write("outside.md", "# Not allowed\n");
  }
  out({ type: "result", subtype: "success", is_error: false, result: "done" });
}
```

- [ ] **Step 2: Failing tests `lib/agents/process.test.ts`**

```ts
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
      runProcess({ bin: "/nonexistent/claude", args: [], cwd: tmpdir(), env: {}, timeoutMs: 1000, onLine: () => {}, shouldCancel: () => false }),
    ).rejects.toThrow(/could not start/i);
  });
});

describe("appendTail", () => {
  it("keeps only the last max characters", () => {
    expect(appendTail("abc", "defg", 5)).toBe("cdefg");
  });
});
```

- [ ] **Step 3: Run to verify failure** — `pnpm vitest run lib/agents/process.test.ts` → FAIL.

- [ ] **Step 4: Implement `lib/agents/process.ts`**

```ts
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

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
    const child = spawn(options.bin, options.args, {
      cwd: options.cwd,
      env: options.env,
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
```

- [ ] **Step 5: Run, gate, commit**

Run: `chmod +x tests/fixtures/fake-claude.mjs && pnpm vitest run lib/agents && pnpm check` → PASS.
```bash
git add lib/agents tests/fixtures/fake-claude.mjs
git commit -m "feat(agents): process-group runner with timeout, cancel and capped logs"
```

---

### Task 4: Brain git gate

**Files:**
- Create: `lib/agents/brain-git.ts`, `lib/agents/brain-git.test.ts`, `tests/helpers/git-brain.ts`

**Interfaces:**
- Produces: `type Change = { path: string; untracked: boolean }`; `changedPaths(root): Change[]`; `isAllowedChange(path: string, allowed: AllowedPaths): boolean` with `type AllowedPaths = { prefixes: string[]; exact: string[] }`; `partitionChanges(changes, allowed): { allowed: Change[]; rejected: Change[] }`; `restoreChanges(root, changes): void`; `commitChanges(root, paths: string[], message: string): string` (sha); `pushBrain(root): { ok: true } | { ok: false; error: string }`; `unpushedCount(root): number | null`.
- Test helper `makeGitBrain(files): { root, remote, cleanup }` — a brain repo with one commit and a bare remote tracking `main`.

- [ ] **Step 1: Helper `tests/helpers/git-brain.ts`**

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBrain } from "./brain";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

/** A committed brain repo with a bare remote, for git-gate tests. */
export function makeGitBrain(files: Record<string, string>) {
  const brain = makeBrain({ "README.md": "# Brain\n", ...files });
  const remoteDir = mkdtempSync(join(tmpdir(), "harbour-remote-"));
  const remote = join(remoteDir, "brain.git");
  git(remoteDir, "init", "-q", "--bare", "-b", "main", remote);
  git(brain.root, "init", "-q", "-b", "main");
  git(brain.root, "config", "user.name", "Test Owner");
  git(brain.root, "config", "user.email", "owner@example.com");
  git(brain.root, "add", "-A");
  git(brain.root, "commit", "-q", "-m", "init");
  git(brain.root, "remote", "add", "origin", remote);
  git(brain.root, "push", "-q", "-u", "origin", "main");
  return {
    root: brain.root,
    remote,
    git: (...args: string[]) => git(brain.root, ...args),
    cleanup: () => {
      brain.cleanup();
      rmSync(remoteDir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 2: Failing tests `lib/agents/brain-git.test.ts`**

```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { changedPaths, commitChanges, isAllowedChange, partitionChanges, pushBrain, restoreChanges, unpushedCount } from "./brain-git";

const research = { prefixes: ["research/"], exact: ["00-start-here.md"] };

describe("isAllowedChange", () => {
  it("allows markdown inside the area and exact paths only", () => {
    expect(isAllowedChange("research/geo/a.md", research)).toBe(true);
    expect(isAllowedChange("00-start-here.md", research)).toBe(true);
    expect(isAllowedChange("research/geo/a.json", research)).toBe(false);
    expect(isAllowedChange("products/x/notes.md", research)).toBe(false);
    expect(isAllowedChange("research/../products/x.md", research)).toBe(false);
  });
  it("allows proposals.json only when listed exactly", () => {
    const discovery = { prefixes: ["products/acme-docs/"], exact: ["products/acme-docs/proposals.json"] };
    expect(isAllowedChange("products/acme-docs/proposals.json", discovery)).toBe(true);
    expect(isAllowedChange("products/acme-docs/other.json", discovery)).toBe(false);
  });
});

describe("git gate", () => {
  it("lists changes, restores rejected ones, commits allowed ones and pushes", () => {
    const b = makeGitBrain({ "products/acme-docs/notes.md": "# Notes\n" });
    try {
      mkdirSync(join(b.root, "research/geo"), { recursive: true });
      writeFileSync(join(b.root, "research/geo/a.md"), "# A\n");
      writeFileSync(join(b.root, "products/acme-docs/notes.md"), "# Tampered\n");
      writeFileSync(join(b.root, "stray.txt"), "x");

      const changes = changedPaths(b.root);
      expect(changes.map((c) => c.path).sort()).toEqual(["products/acme-docs/notes.md", "research/geo/a.md", "stray.txt"]);
      const { allowed, rejected } = partitionChanges(changes, research);
      expect(allowed.map((c) => c.path)).toEqual(["research/geo/a.md"]);

      restoreChanges(b.root, rejected);
      expect(existsSync(join(b.root, "stray.txt"))).toBe(false);
      expect(b.git("show", "HEAD:products/acme-docs/notes.md")).toBe("# Notes\n");
      expect(changedPaths(b.root).map((c) => c.path)).toEqual(["research/geo/a.md"]);

      const sha = commitChanges(b.root, ["research/geo/a.md"], "agent(research): add a");
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(changedPaths(b.root)).toEqual([]);
      expect(unpushedCount(b.root)).toBe(1);
      expect(pushBrain(b.root)).toEqual({ ok: true });
      expect(unpushedCount(b.root)).toBe(0);
    } finally {
      b.cleanup();
    }
  });

  it("reports a push failure instead of throwing", () => {
    const b = makeGitBrain({});
    try {
      b.git("remote", "set-url", "origin", "/nonexistent/remote.git");
      writeFileSync(join(b.root, "x.md"), "# x\n");
      commitChanges(b.root, ["x.md"], "x");
      const result = pushBrain(b.root);
      expect(result.ok).toBe(false);
    } finally {
      b.cleanup();
    }
  });
});
```

- [ ] **Step 3: Run to verify failure** — `pnpm vitest run lib/agents/brain-git.test.ts` → FAIL.

- [ ] **Step 4: Implement `lib/agents/brain-git.ts`**

```ts
import { execFileSync } from "node:child_process";
import { posix } from "node:path";

export type Change = { path: string; untracked: boolean };
export type AllowedPaths = { prefixes: string[]; exact: string[] };

const GIT_TIMEOUT_MS = 60_000;

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: GIT_TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] });
}

/** Uncommitted changes (including untracked files), brain-relative. */
export function changedPaths(root: string): Change[] {
  const out = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const entries = out.split("\0").filter(Boolean);
  const changes: Change[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? "";
    const code = entry.slice(0, 2);
    changes.push({ path: entry.slice(3), untracked: code === "??" });
    if (code.startsWith("R") || code.startsWith("C")) i++; // skip the rename source
  }
  return changes;
}

/** Inside an allowed prefix as markdown, or one of the exact allowed paths. */
export function isAllowedChange(path: string, allowed: AllowedPaths): boolean {
  if (posix.normalize(path) !== path || path.startsWith("/")) return false;
  if (allowed.exact.includes(path)) return true;
  return path.endsWith(".md") && allowed.prefixes.some((prefix) => path.startsWith(prefix));
}

export function partitionChanges(changes: Change[], allowed: AllowedPaths) {
  return {
    allowed: changes.filter((c) => isAllowedChange(c.path, allowed)),
    rejected: changes.filter((c) => !isAllowedChange(c.path, allowed)),
  };
}

/** Puts changed files back to HEAD; deletes untracked ones. */
export function restoreChanges(root: string, changes: Change[]): void {
  const tracked = changes.filter((c) => !c.untracked).map((c) => c.path);
  const untracked = changes.filter((c) => c.untracked).map((c) => c.path);
  if (tracked.length) git(root, ["restore", "--staged", "--worktree", "--source=HEAD", "--", ...tracked]);
  if (untracked.length) git(root, ["clean", "-f", "-q", "--", ...untracked]);
}

/** Commits exactly these paths; returns the new commit sha. */
export function commitChanges(root: string, paths: string[], message: string): string {
  git(root, ["add", "--", ...paths]);
  git(root, ["commit", "-q", "-m", message, "--", ...paths]);
  return git(root, ["rev-parse", "HEAD"]).trim();
}

export function pushBrain(root: string): { ok: true } | { ok: false; error: string } {
  try {
    git(root, ["push", "-q"]);
    return { ok: true };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr;
    return { ok: false, error: (stderr || (error as Error).message).trim().slice(0, 300) };
  }
}

/** Commits not yet on the upstream, or null when there is no upstream. */
export function unpushedCount(root: string): number | null {
  try {
    return Number(git(root, ["rev-list", "--count", "@{upstream}..HEAD"]).trim());
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run, gate, commit**

Run: `pnpm vitest run lib/agents && pnpm check` → PASS.
```bash
git add lib/agents tests/helpers/git-brain.ts
git commit -m "feat(agents): brain git gate — restore out-of-scope changes, commit and push"
```

---

### Task 5: Research topics, prompts and job specs

**Files:**
- Create: `lib/agents/topics.ts`, `lib/agents/prompts.ts`, `lib/agents/prompts.test.ts`, `lib/agents/specs.ts`, `lib/agents/specs.test.ts`

**Interfaces:**
- Consumes: `Product` from `@/lib/products/catalog`; `AllowedPaths`.
- Produces: `RESEARCH_TOPICS: readonly ResearchTopic[]` with `type ResearchTopic = { id: string; title: string; path: string; brief: string }`; `PROMPT_VERSION = "2b-v1"`; `researchPrompt(topic, products, today: string): string`; `discoveryPrompt(product, today): string`; `type AgentSpec = { kind: "research" | "discovery"; label: string; prompt: string; allowed: AllowedPaths; targets: string[]; proposalsPath: string | null; requiredFiles: string[] }`; `specForJob(kind, params, products, today): AgentSpec` (throws `Error` with a readable message for unknown topic/product).

- [ ] **Step 1: `lib/agents/topics.ts`**

```ts
export type ResearchTopic = { id: string; title: string; path: string; brief: string };

/** The research sprint: one job per topic, each writing exactly one document. */
export const RESEARCH_TOPICS: readonly ResearchTopic[] = [
  { id: "seo-fundamentals", title: "SEO fundamentals", path: "research/seo/seo-fundamentals.md", brief: "How search engines crawl, index and rank pages; what matters most for a small product site; common myths." },
  { id: "technical-seo-checklist", title: "Technical SEO checklist", path: "research/seo/technical-seo-checklist.md", brief: "A practical checklist: indexability, sitemaps, robots.txt, canonicals, structured data, Core Web Vitals, internal links — with how to check each." },
  { id: "local-seo", title: "Local SEO", path: "research/seo/local-seo.md", brief: "Google Business Profile, local citations, reviews, 'near me' and suburb searches, local landing pages." },
  { id: "how-ai-engines-pick-sources", title: "How AI engines select and cite sources", path: "research/geo/how-ai-engines-pick-sources.md", brief: "How ChatGPT, Perplexity, Gemini and Claude choose and cite web sources; what evidence exists; what content gets cited (GEO)." },
  { id: "llms-txt-and-ai-crawlers", title: "llms.txt and AI crawler access", path: "research/geo/llms-txt-and-ai-crawlers.md", brief: "The llms.txt proposal, AI crawler user agents (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended) and robots.txt choices." },
  { id: "aeo-and-ai-overviews", title: "AEO, featured snippets and AI Overviews", path: "research/aeo/aeo-and-ai-overviews.md", brief: "Answer engine optimisation: featured snippets, People Also Ask, Google AI Overviews and AI Mode; content and schema that get quoted." },
  { id: "google-preferred-sources", title: "Google Preferred Sources", path: "research/seo/google-preferred-sources.md", brief: "How Preferred Sources works, eligibility (domain/subdomain, fresh Top Stories-style content), the button/deeplink and placement, and realistic eligibility for each product." },
  { id: "glossary", title: "Glossary", path: "research/glossary.md", brief: "Plain-English definitions of every SEO/GEO/AEO term a beginner will meet, linking to the other research documents with [[wiki-links]]." },
  { id: "start-here", title: "Start here", path: "00-start-here.md", brief: "A beginner's guide to this Second Brain: what SEO, GEO and AEO are, the reading order of the research documents (as [[wiki-links]]), and the first five actions to take." },
  { id: "scoring-rationale", title: "Scoring rationale", path: "research/scoring-rationale.md", brief: "Proposed sub-scores and weights for Harbour's SEO, GEO and AEO scores (0–100) with justification and known limitations." },
];
```

- [ ] **Step 2: Failing tests**

`lib/agents/prompts.test.ts`:
```ts
import { discoveryPrompt, PROMPT_VERSION, researchPrompt } from "./prompts";
import { RESEARCH_TOPICS } from "./topics";

const products = [{ id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" as const }];

describe("researchPrompt", () => {
  const topic = RESEARCH_TOPICS.find((t) => t.id === "how-ai-engines-pick-sources")!;
  const prompt = researchPrompt(topic, products, "2026-10-01");

  it("names exactly one target file and the date", () => {
    expect(prompt).toMatch(/^TARGET_FILES: research\/geo\/how-ai-engines-pick-sources\.md$/m);
    expect(prompt).toContain("2026-10-01");
  });
  it("requires citations, frontmatter and a products section", () => {
    expect(prompt).toMatch(/cite/i);
    expect(prompt).toContain("review_by: 2026-12-30");
    expect(prompt).toContain("What this means for our products");
    expect(prompt).toContain("Acme Docs (https://docs.example.com)");
    expect(prompt).toContain("products/acme-docs/notes.md");
  });
  it("forbids writing anything else", () => {
    expect(prompt).toMatch(/do not create, edit or delete any other file/i);
  });
  it("is versioned", () => {
    expect(PROMPT_VERSION).toBe("2b-v1");
  });
});

describe("discoveryPrompt", () => {
  const prompt = discoveryPrompt(products[0]!, "2026-10-01");
  it("targets the product's discovery files and specifies the proposals schema", () => {
    expect(prompt).toMatch(/^TARGET_FILES: products\/acme-docs\/discovery\.md, products\/acme-docs\/proposals\.json$/m);
    expect(prompt).toContain('"keywords"');
    expect(prompt).toContain('"questions"');
    expect(prompt).toContain('"competitors"');
    expect(prompt).toContain("products/acme-docs/notes.md");
  });
});
```

`lib/agents/specs.test.ts`:
```ts
import { specForJob } from "./specs";

const products = [{ id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" as const }];

describe("specForJob", () => {
  it("builds a research spec restricted to its one document", () => {
    const spec = specForJob("research", { topic: "glossary" }, products, "2026-10-01");
    expect(spec).toMatchObject({
      kind: "research",
      label: "Research: Glossary",
      targets: ["research/glossary.md"],
      allowed: { prefixes: [], exact: ["research/glossary.md"] },
      proposalsPath: null,
      requiredFiles: [],
    });
  });

  it("builds a discovery spec that needs the owner's notes", () => {
    const spec = specForJob("discovery", { productId: "acme-docs" }, products, "2026-10-01");
    expect(spec).toMatchObject({
      label: "Discovery: Acme Docs",
      targets: ["products/acme-docs/discovery.md", "products/acme-docs/proposals.json"],
      allowed: { prefixes: [], exact: ["products/acme-docs/discovery.md", "products/acme-docs/proposals.json"] },
      proposalsPath: "products/acme-docs/proposals.json",
      requiredFiles: ["products/acme-docs/notes.md"],
    });
  });

  it("rejects unknown topics and products", () => {
    expect(() => specForJob("research", { topic: "nope" }, products, "2026-10-01")).toThrow(/unknown research topic/i);
    expect(() => specForJob("discovery", { productId: "nope" }, products, "2026-10-01")).toThrow(/unknown product/i);
  });
});
```

- [ ] **Step 3: Run to verify failure** — `pnpm vitest run lib/agents` → FAIL.

- [ ] **Step 4: Implement `lib/agents/prompts.ts`**

```ts
import type { Product } from "@/lib/products/catalog";
import type { ResearchTopic } from "./topics";

export const PROMPT_VERSION = "2b-v1";

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const RULES = `Rules:
- Work only inside the current directory (the owner's private Second Brain).
- Do not create, edit or delete any other file than the target file(s) above. Changes elsewhere are discarded and fail the run.
- Use web search and web fetch to research. Prefer primary sources (official documentation, the platform's own announcements, peer-reviewed or large studies) over blogs.
- Cite every factual claim inline with a Markdown link to its source. Never invent sources, numbers or quotes; say what is uncertain.
- Write in plain English for a beginner. Explain jargon on first use.`;

function productContext(products: readonly Product[]): string {
  return products
    .map((p) => `- ${p.name} (${p.url}) — read products/${p.id}/notes.md first if it exists.`)
    .join("\n");
}

/** Prompt for one research-sprint document. */
export function researchPrompt(topic: ResearchTopic, products: readonly Product[], today: string): string {
  return `TARGET_FILES: ${topic.path}

You are a careful research analyst writing one document for a small business owner's private knowledge base.

Topic: ${topic.title}
Scope: ${topic.brief}
Today's date: ${today}

Write the file ${topic.path} in Markdown, starting with this YAML frontmatter:
---
title: ${topic.title}
tags: [${topic.path.split("/")[1]?.replace(".md", "") ?? "guide"}]
researched: ${today}
confidence: low | medium | high   (choose one, based on the quality of evidence)
review_by: ${addDays(today, 90)}
sources: [list every source URL you cite]
---

Structure: a short summary first, then sections with ## headings, then a section titled
"## What this means for our products" with specific, practical implications for each product:
${productContext(products)}

Link to related documents in this knowledge base with [[wiki-links]] using their file names
(for example [[glossary]] or [[how-ai-engines-pick-sources]]).

${RULES}`;
}

/** Prompt for one product's discovery: keywords, AI questions and competitors. */
export function discoveryPrompt(product: Product, today: string): string {
  const dir = `products/${product.id}`;
  return `TARGET_FILES: ${dir}/discovery.md, ${dir}/proposals.json

You are an SEO and AI-visibility strategist doing discovery for one product.

Product: ${product.name} (${product.url})
Owner's notes: ${dir}/notes.md (read this first — audience, market, positioning).
Today's date: ${today}

Research the product's market: what people search for, which questions they ask AI assistants,
and which competitors rank or get cited. Then write two files:

1. ${dir}/discovery.md — Markdown with frontmatter (title, tags: [discovery], researched: ${today},
   sources: [...]) explaining your evidence and reasoning, with cited sources.

2. ${dir}/proposals.json — exactly this JSON shape and nothing else:
{
  "keywords": [{ "term": "...", "intent": "informational|commercial|transactional|navigational|local", "location": "optional, e.g. a suburb", "why": "..." }],
  "questions": [{ "text": "a natural question someone would ask an AI assistant", "why": "..." }],
  "competitors": [{ "name": "...", "url": "https://...", "why": "..." }]
}
Aim for about 30 keywords, about 12 questions and 3 to 5 competitors. Every "why" is one sentence.

${RULES}`;
}
```

- [ ] **Step 5: Implement `lib/agents/specs.ts`**

```ts
import type { Product } from "@/lib/products/catalog";
import type { AllowedPaths } from "./brain-git";
import { discoveryPrompt, researchPrompt } from "./prompts";
import { RESEARCH_TOPICS } from "./topics";

export type AgentSpec = {
  kind: "research" | "discovery";
  label: string;
  prompt: string;
  allowed: AllowedPaths;
  targets: string[];
  proposalsPath: string | null;
  requiredFiles: string[];
};

/** Turns a queued job's params into exactly what the agent may do. */
export function specForJob(
  kind: "research" | "discovery",
  params: Record<string, string>,
  products: readonly Product[],
  today: string,
): AgentSpec {
  if (kind === "research") {
    const topic = RESEARCH_TOPICS.find((t) => t.id === params.topic);
    if (!topic) throw new Error(`Unknown research topic: ${params.topic ?? "(none)"}`);
    return {
      kind,
      label: `Research: ${topic.title}`,
      prompt: researchPrompt(topic, products, today),
      allowed: { prefixes: [], exact: [topic.path] },
      targets: [topic.path],
      proposalsPath: null,
      requiredFiles: [],
    };
  }
  const product = products.find((p) => p.id === params.productId);
  if (!product) throw new Error(`Unknown product: ${params.productId ?? "(none)"}`);
  const dir = `products/${product.id}`;
  const targets = [`${dir}/discovery.md`, `${dir}/proposals.json`];
  return {
    kind,
    label: `Discovery: ${product.name}`,
    prompt: discoveryPrompt(product, today),
    allowed: { prefixes: [], exact: targets },
    targets,
    proposalsPath: `${dir}/proposals.json`,
    requiredFiles: [`${dir}/notes.md`],
  };
}
```

- [ ] **Step 6: Run, gate, commit**

Run: `pnpm vitest run lib/agents && pnpm check` → PASS.
```bash
git add lib/agents
git commit -m "feat(agents): research topics, versioned prompts and job specs"
```

---

### Task 6: Proposals — validation, import and decisions

**Files:**
- Create: `lib/agents/proposals.ts`, `lib/agents/proposals.test.ts`

**Interfaces:**
- Produces: `proposalsSchema`; `type Proposals = z.infer<typeof proposalsSchema>`; `type ProposalType = "keyword" | "question" | "competitor"`; `parseProposals(text: string): Proposals` (throws `Error` with a readable message); `importProposals(db, productId, proposals, jobId: number | null, now?): { added: number; skipped: number }`; `listProposals(db, productId): Record<ProposalType, ProposalRow[]>` with `type ProposalRow = typeof proposals.$inferSelect`; `decideProposal(db, productId, id, status: "approved" | "rejected", now?): boolean`; `editProposal(db, productId, id, value: Record<string, string>, now?): { ok: true } | { ok: false; error: string }`; `approveAllProposed(db, productId, type, now?): number`.

- [ ] **Step 1: Failing tests `lib/agents/proposals.test.ts`**

```ts
import { openTestDb } from "@/tests/helpers/db";
import { approveAllProposed, decideProposal, editProposal, importProposals, listProposals, parseProposals } from "./proposals";

const sample = {
  keywords: [
    { term: "Example Widgets", intent: "commercial", why: "Core term" },
    { term: "widgets near me", intent: "local", location: "Springfield", why: "Local intent" },
  ],
  questions: [{ text: "What is the best example widget?", why: "Buyer question" }],
  competitors: [{ name: "Example Rival", url: "https://rival.example.com", why: "Ranks well" }],
};

describe("parseProposals", () => {
  it("accepts the documented shape", () => {
    expect(parseProposals(JSON.stringify(sample)).keywords).toHaveLength(2);
  });
  it("rejects invalid JSON, unknown intents and non-http competitor URLs", () => {
    expect(() => parseProposals("{ nope")).toThrow(/not valid JSON/i);
    expect(() => parseProposals(JSON.stringify({ ...sample, keywords: [{ term: "x", intent: "vibes", why: "y" }] }))).toThrow(/intent/);
    expect(() => parseProposals(JSON.stringify({ ...sample, competitors: [{ name: "x", url: "javascript:alert(1)", why: "y" }] }))).toThrow();
  });
});

describe("importing and deciding", () => {
  it("imports as proposed, dedupes case-insensitively, and never overwrites decisions", () => {
    const db = openTestDb();
    const first = importProposals(db, "acme-docs", parseProposals(JSON.stringify(sample)), null);
    expect(first).toEqual({ added: 4, skipped: 0 });

    const keyword = listProposals(db, "acme-docs").keyword.find((p) => p.value.term === "Example Widgets")!;
    expect(decideProposal(db, "acme-docs", keyword.id, "approved")).toBe(true);

    const again = { ...sample, keywords: [{ term: "example widgets", intent: "informational", why: "dup" }] };
    expect(importProposals(db, "acme-docs", parseProposals(JSON.stringify(again)), null)).toEqual({ added: 0, skipped: 3 });
    const after = listProposals(db, "acme-docs").keyword.find((p) => p.id === keyword.id)!;
    expect(after.status).toBe("approved");
    expect(after.value.intent).toBe("commercial");
  });

  it("scopes decisions to the product and validates edits", () => {
    const db = openTestDb();
    importProposals(db, "acme-docs", parseProposals(JSON.stringify(sample)), null);
    const q = listProposals(db, "acme-docs").question[0]!;
    expect(decideProposal(db, "other-product", q.id, "approved")).toBe(false);
    expect(editProposal(db, "acme-docs", q.id, { text: "" })).toMatchObject({ ok: false });
    expect(editProposal(db, "acme-docs", q.id, { text: "What does an example widget cost?" })).toEqual({ ok: true });
    expect(listProposals(db, "acme-docs").question[0]).toMatchObject({ edited: true, value: { text: "What does an example widget cost?" } });
  });

  it("approves all proposed items of one type", () => {
    const db = openTestDb();
    importProposals(db, "acme-docs", parseProposals(JSON.stringify(sample)), null);
    expect(approveAllProposed(db, "acme-docs", "keyword")).toBe(2);
    expect(listProposals(db, "acme-docs").keyword.every((p) => p.status === "approved")).toBe(true);
    expect(listProposals(db, "acme-docs").question[0]?.status).toBe("proposed");
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement `lib/agents/proposals.ts`**

```ts
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { proposals } from "@/lib/db/schema";

const why = z.string().trim().min(1).max(400);
const keyword = z.object({
  term: z.string().trim().min(1).max(120),
  intent: z.enum(["informational", "commercial", "transactional", "navigational", "local"]),
  location: z.string().trim().min(1).max(80).optional(),
  why,
});
const question = z.object({ text: z.string().trim().min(1).max(300), why });
const competitor = z.object({ name: z.string().trim().min(1).max(120), url: z.url({ protocol: /^https?$/ }), why });

export const proposalsSchema = z.object({
  keywords: z.array(keyword).max(60),
  questions: z.array(question).max(30),
  competitors: z.array(competitor).max(10),
});

export type Proposals = z.infer<typeof proposalsSchema>;
export type ProposalType = "keyword" | "question" | "competitor";
export type ProposalRow = typeof proposals.$inferSelect;

const VALUE_SCHEMAS = {
  keyword: keyword.omit({ why: true }),
  question: question.omit({ why: true }),
  competitor: competitor.omit({ why: true }),
} as const;

function keyFor(type: ProposalType, value: Record<string, string | undefined>): string {
  if (type === "keyword") return `${value.term ?? ""}|${value.location ?? ""}`.toLowerCase().trim();
  if (type === "question") return (value.text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return URL.canParse(value.url ?? "") ? new URL(value.url ?? "").hostname.replace(/^www\./, "") : (value.name ?? "").toLowerCase();
}

/** Parses an agent's proposals.json; throws with a readable reason. */
export function parseProposals(text: string): Proposals {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("proposals.json is not valid JSON");
  }
  const result = proposalsSchema.safeParse(raw);
  if (!result.success) throw new Error(`proposals.json is invalid:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** Inserts new items as proposed; existing items (any status) are left untouched. */
export function importProposals(db: Db, productId: string, data: Proposals, jobId: number | null, now = new Date()) {
  const rows: { type: ProposalType; value: Record<string, string>; why: string }[] = [
    ...data.keywords.map(({ why: w, ...value }) => ({ type: "keyword" as const, value: value as Record<string, string>, why: w })),
    ...data.questions.map(({ why: w, ...value }) => ({ type: "question" as const, value, why: w })),
    ...data.competitors.map(({ why: w, ...value }) => ({ type: "competitor" as const, value, why: w })),
  ];
  let added = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      const inserted = tx
        .insert(proposals)
        .values({ productId, type: row.type, value: row.value, key: keyFor(row.type, row.value), why: row.why, status: "proposed", sourceJobId: jobId, createdAt: now })
        .onConflictDoNothing()
        .returning({ id: proposals.id })
        .all();
      added += inserted.length;
    }
  });
  return { added, skipped: rows.length - added };
}

export function listProposals(db: Db, productId: string): Record<ProposalType, ProposalRow[]> {
  const all = db.select().from(proposals).where(eq(proposals.productId, productId)).orderBy(asc(proposals.id)).all();
  return {
    keyword: all.filter((p) => p.type === "keyword"),
    question: all.filter((p) => p.type === "question"),
    competitor: all.filter((p) => p.type === "competitor"),
  };
}

export function decideProposal(db: Db, productId: string, id: number, status: "approved" | "rejected", now = new Date()): boolean {
  return (
    db.update(proposals).set({ status, decidedAt: now })
      .where(and(eq(proposals.id, id), eq(proposals.productId, productId)))
      .returning({ id: proposals.id }).all().length === 1
  );
}

export function editProposal(db: Db, productId: string, id: number, value: Record<string, string>, now = new Date()) {
  const row = db.select().from(proposals).where(and(eq(proposals.id, id), eq(proposals.productId, productId))).get();
  if (!row) return { ok: false as const, error: "not_found" };
  const parsed = VALUE_SCHEMAS[row.type].safeParse(value);
  if (!parsed.success) return { ok: false as const, error: z.prettifyError(parsed.error) };
  const clean = parsed.data as Record<string, string>;
  try {
    db.update(proposals).set({ value: clean, key: keyFor(row.type, clean), edited: true, decidedAt: now }).where(eq(proposals.id, id)).run();
  } catch {
    return { ok: false as const, error: "An item with that value already exists" };
  }
  return { ok: true as const };
}

export function approveAllProposed(db: Db, productId: string, type: ProposalType, now = new Date()): number {
  return db.update(proposals).set({ status: "approved", decidedAt: now })
    .where(and(eq(proposals.productId, productId), eq(proposals.type, type), eq(proposals.status, "proposed")))
    .returning({ id: proposals.id }).all().length;
}
```

- [ ] **Step 4: Run, gate, commit**

Run: `pnpm vitest run lib/agents && pnpm check` → PASS.
```bash
git add lib/agents
git commit -m "feat(agents): validated discovery proposals with import and decisions"
```

---

### Task 7: Job orchestration and the worker

**Files:**
- Create: `lib/jobs/run-job.ts`, `lib/jobs/run-job.test.ts`, `lib/jobs/housekeeping.ts`, `lib/jobs/housekeeping.test.ts`, `worker/index.ts`
- Modify: `package.json` (script `worker`)

**Interfaces:**
- Consumes: Tasks 1–6; `getConfig`, `getDb`, `getProducts` (verify `lib/products/catalog.ts` has no `server-only` import), `checkBrainRoot`, `isoDateIn`.
- Also produces `housekeepingAction(root: string, now: Date, opts: { quietMs: number; pushRetryDue: boolean }): "notes-sync" | "brain-push" | null` in `lib/jobs/housekeeping.ts`: returns `"notes-sync"` when the brain has uncommitted changes and the newest changed file's mtime is at least `quietMs` old (deleted files count as changed now → wait); else `"brain-push"` when `pushRetryDue` and `unpushedCount(root) > 0`; else null. Never throws: if the brain is missing or git fails, log once and return null. Tests (git temp brain, injected `now`): fresh edit → null; edit older than quietMs → "notes-sync"; clean brain with an unpushed commit and pushRetryDue → "brain-push"; pushRetryDue false → null; missing root → null.
- Also produces `runNotesSyncJob(deps, job): void` (commit all owner changes, then push). Add tests: with an uncommitted note it commits with message `notes: owner update (1 file(s))` and pushes; with no changes it finishes ok with "Nothing to save"; a later agent run is no longer blocked by "uncommitted changes".
- Produces: `type RunDeps = { db: Db; root: string; bin: string; token: string | undefined; model: string; timeoutMs: number; products: readonly Product[]; today: string; home: string; path: string; run: typeof runProcess; now: () => Date }`; `runAgentJob(deps, job): Promise<void>`; `runPushJob(deps, job): void`; script `pnpm worker`.

- [ ] **Step 1: Failing tests `lib/jobs/run-job.test.ts`** (real fake CLI, real git brain, in-memory DB)

```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentRuns, proposals } from "@/lib/db/schema";
import { runProcess } from "@/lib/agents/process";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { openTestDb } from "@/tests/helpers/db";
import { claimNextJob, enqueueJob, eventsSince, getJob, requestCancel } from "./queue";
import { runAgentJob, type RunDeps } from "./run-job";

const FAKE = join(process.cwd(), "tests/fixtures/fake-claude.mjs");
const products = [{ id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" as const }];

function setup(scenario: string, files: Record<string, string> = {}, overrides: Partial<RunDeps> = {}) {
  const brain = makeGitBrain(files);
  const db = openTestDb();
  const deps: RunDeps = {
    db, root: brain.root, bin: FAKE, token: "test-token", model: "sonnet", timeoutMs: 20_000,
    products, today: "2026-10-01", home: brain.root, path: process.env.PATH ?? "",
    run: (o) => runProcess({ ...o, env: { ...o.env, FAKE_CLAUDE_SCENARIO: scenario }, pollMs: 50, killGraceMs: 500 }),
    now: () => new Date(), ...overrides,
  };
  return { brain, db, deps };
}

async function runOne(deps: RunDeps, kind: "research" | "discovery", params: Record<string, string>) {
  enqueueJob(deps.db, kind, params, null);
  const job = claimNextJob(deps.db)!;
  await runAgentJob(deps, job);
  return getJob(deps.db, job.id)!;
}

describe("runAgentJob", () => {
  it("commits the research document, pushes, and records activity", async () => {
    const { brain, db, deps } = setup("success");
    try {
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job).toMatchObject({ status: "ok", error: null });
      expect(brain.git("log", "-1", "--format=%s")).toMatch(/^agent\(research\): Glossary/);
      expect(brain.git("status", "--porcelain")).toBe("");
      const run = db.select().from(agentRuns).get()!;
      expect(run).toMatchObject({ pushed: true, filesChanged: ["research/glossary.md"], promptVersion: "2b-v1" });
      expect(eventsSince(db, job.id, 0).map((e) => e.text)).toEqual(expect.arrayContaining(["Searching: fake research query", "Writing: research/glossary.md"]));
    } finally {
      brain.cleanup();
    }
  });

  it("fails and restores everything when the agent writes outside its area", async () => {
    const { brain, deps } = setup("escape");
    try {
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/outside.md/);
      expect(existsSync(join(brain.root, "outside.md"))).toBe(false);
      expect(existsSync(join(brain.root, "research/glossary.md"))).toBe(false);
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });

  it("imports discovery proposals as proposed", async () => {
    const { brain, db, deps } = setup("success", { "products/acme-docs/notes.md": "# Notes\n" });
    try {
      const job = await runOne(deps, "discovery", { productId: "acme-docs" });
      expect(job.status).toBe("ok");
      expect(db.select().from(proposals).all().map((p) => p.status)).toEqual(["proposed", "proposed", "proposed"]);
    } finally {
      brain.cleanup();
    }
  });

  it("fails without importing when proposals are invalid", async () => {
    const { brain, db, deps } = setup("bad-json", { "products/acme-docs/notes.md": "# Notes\n" });
    try {
      const job = await runOne(deps, "discovery", { productId: "acme-docs" });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/not valid JSON/);
      expect(db.select().from(proposals).all()).toEqual([]);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });

  it("refuses discovery without owner notes", async () => {
    const a = setup("success");
    try {
      expect((await runOne(a.deps, "discovery", { productId: "acme-docs" })).error).toMatch(/notes\.md/);
    } finally {
      a.brain.cleanup();
    }
  });

  it("saves the owner's unsaved notes in their own commit before running", async () => {
    const a = setup("success");
    try {
      writeFileSync(join(a.brain.root, "draft.md"), "# draft\n");
      const job = await runOne(a.deps, "research", { topic: "glossary" });
      expect(job.status).toBe("ok");
      const subjects = a.brain.git("log", "--format=%s", "-2").trim().split("\n");
      expect(subjects[1]).toMatch(/^notes: owner update \(1 file/);
      expect(subjects[0]).toMatch(/^agent\(research\)/);
      expect(a.brain.git("show", "--stat", "--format=", "HEAD")).not.toContain("draft.md");
    } finally {
      a.brain.cleanup();
    }
  });

  it("fails clearly without a token, on CLI error, when nothing is written, and on timeout", async () => {
    const cases: [string, Partial<RunDeps>, RegExp][] = [
      ["success", { token: undefined }, /HARBOUR_CLAUDE_OAUTH_TOKEN/],
      ["fail", {}, /Not logged in/],
      ["noop", {}, /without writing/i],
      ["slow", { timeoutMs: 300 }, /timed out/i],
    ];
    for (const [scenario, overrides, expected] of cases) {
      const s = setup(scenario, {}, overrides);
      try {
        expect((await runOne(s.deps, "research", { topic: "glossary" })).error, scenario).toMatch(expected);
      } finally {
        s.brain.cleanup();
      }
    }
  });

  it("cancels, discarding partial work", async () => {
    const { brain, db, deps } = setup("slow");
    try {
      enqueueJob(db, "research", { topic: "glossary" }, null);
      const job = claimNextJob(db)!;
      setTimeout(() => requestCancel(db, job.id), 150);
      await runAgentJob(deps, job);
      expect(getJob(db, job.id)?.status).toBe("cancelled");
    } finally {
      brain.cleanup();
    }
  });

  it("keeps the commit and reports when the push fails", async () => {
    const { brain, db, deps } = setup("success");
    try {
      brain.git("remote", "set-url", "origin", "/nonexistent/remote.git");
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job.status).toBe("ok");
      expect(db.select().from(agentRuns).get()?.pushed).toBe(false);
      expect(eventsSince(db, job.id, 0).some((e) => e.kind === "error" && /push failed/i.test(e.text))).toBe(true);
    } finally {
      brain.cleanup();
    }
  });
});
```

Silence unused-import lint by removing `mkdirSync` if unused.

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement `lib/jobs/run-job.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { commitChanges, changedPaths, partitionChanges, pushBrain, restoreChanges } from "@/lib/agents/brain-git";
import { agentEnv, claudeArgs } from "@/lib/agents/claude-args";
import type { runProcess } from "@/lib/agents/process";
import { importProposals, parseProposals } from "@/lib/agents/proposals";
import { PROMPT_VERSION } from "@/lib/agents/prompts";
import { specForJob } from "@/lib/agents/specs";
import { summariseLine, type StreamResult } from "@/lib/agents/stream";
import type { Db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import type { Product } from "@/lib/products/catalog";
import { addEvent, finishJob, isCancelRequested, type Job } from "./queue";

export type RunDeps = {
  db: Db;
  root: string;
  bin: string;
  token: string | undefined;
  model: string;
  timeoutMs: number;
  products: readonly Product[];
  today: string;
  home: string;
  path: string;
  run: typeof runProcess;
  now: () => Date;
};

class JobFailure extends Error {}

function discardAll(root: string) {
  restoreChanges(root, changedPaths(root));
}

/** Runs one research/discovery job end to end; always finishes the job row. */
export async function runAgentJob(deps: RunDeps, job: Job): Promise<void> {
  const { db, root } = deps;
  const event = (kind: Parameters<typeof addEvent>[2], text: string) => addEvent(db, job.id, kind, text, deps.now());
  let started = false;
  try {
    if (job.kind !== "research" && job.kind !== "discovery") throw new JobFailure(`Not an agent job: ${job.kind}`);
    const spec = specForJob(job.kind, job.params, deps.products, deps.today);
    if (!deps.token) throw new JobFailure("HARBOUR_CLAUDE_OAUTH_TOKEN is not set — run `claude setup-token` and add it to .env");
    const ownerChanges = changedPaths(root);
    if (ownerChanges.length > 0) {
      // Save the owner's edits first so they are never mixed into (or discarded with) agent work.
      commitChanges(root, ownerChanges.map((c) => c.path), `notes: owner update (${ownerChanges.length} file(s))`);
      event("status", `Saved ${ownerChanges.length} note file(s) before starting`);
    }
    for (const file of spec.requiredFiles) {
      if (!existsSync(join(root, file))) throw new JobFailure(`Missing ${file} — write the owner's notes for this product first`);
    }

    db.insert(agentRuns).values({ jobId: job.id, promptVersion: PROMPT_VERSION }).run();
    event("status", `Started ${spec.label}`);
    started = true;
    let result: StreamResult | undefined;
    const outcome = await deps.run({
      bin: deps.bin,
      args: claudeArgs(spec.prompt, deps.model),
      cwd: root,
      env: agentEnv(deps.token, deps.home, deps.path),
      timeoutMs: deps.timeoutMs,
      onLine: (line) => {
        const summary = summariseLine(line, root);
        for (const e of summary.events) event(e.kind, e.text);
        if (summary.result) result = summary.result;
      },
      shouldCancel: () => isCancelRequested(db, job.id),
    });
    db.update(agentRuns).set({ exitCode: outcome.exitCode, stdoutTail: outcome.stdoutTail, stderrTail: outcome.stderrTail })
      .where(eq(agentRuns.jobId, job.id)).run();

    if (outcome.cancelled) {
      discardAll(root);
      event("status", "Cancelled — partial work discarded");
      finishJob(db, job.id, "cancelled", null, deps.now());
      return;
    }
    if (outcome.timedOut) throw new JobFailure(`Timed out after ${Math.round(deps.timeoutMs / 60_000)} minutes`);
    if (outcome.exitCode !== 0 || result?.isError) {
      throw new JobFailure(`Agent failed: ${result?.text || outcome.stderrTail.slice(-300) || `exit ${outcome.exitCode}`}`);
    }

    const { allowed, rejected } = partitionChanges(changedPaths(root), spec.allowed);
    if (rejected.length > 0) throw new JobFailure(`Agent changed files outside its area: ${rejected.map((c) => c.path).join(", ")}`);
    if (allowed.length === 0) throw new JobFailure("Agent finished without writing anything");

    let parsed: ReturnType<typeof parseProposals> | null = null;
    if (spec.proposalsPath) {
      if (!allowed.some((c) => c.path === spec.proposalsPath)) throw new JobFailure(`Agent did not write ${spec.proposalsPath}`);
      try {
        parsed = parseProposals(readFileSync(join(root, spec.proposalsPath), "utf8"));
      } catch (error) {
        throw new JobFailure((error as Error).message);
      }
    }

    const paths = allowed.map((c) => c.path);
    const sha = commitChanges(root, paths, `agent(${spec.kind}): ${spec.label.replace(/^[^:]+:\s*/, "")}`);
    db.update(agentRuns).set({ filesChanged: paths, commitSha: sha }).where(eq(agentRuns.jobId, job.id)).run();
    event("status", `Committed ${paths.length} file(s)`);

    if (parsed && job.kind === "discovery") {
      const { added, skipped } = importProposals(db, job.params.productId ?? "", parsed, job.id, deps.now());
      event("status", `Imported ${added} proposal(s); ${skipped} already known`);
    }

    const push = pushBrain(root);
    db.update(agentRuns).set({ pushed: push.ok }).where(eq(agentRuns.jobId, job.id)).run();
    if (push.ok) event("status", "Pushed to the brain repository");
    else event("error", `Push failed — commit kept locally: ${push.error}`);
    finishJob(db, job.id, "ok", null, deps.now());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof JobFailure)) console.error(`job ${job.id} crashed`, error);
    if (started) {
      try {
        discardAll(root);
      } catch (restoreError) {
        console.error(`job ${job.id}: could not restore the brain`, restoreError);
        event("error", "Could not discard the agent's changes — check the brain repo (git status)");
      }
    }
    event("error", message);
    finishJob(db, job.id, "failed", message, deps.now());
  }
}

/**
 * Saves the owner's own edits (queued from "Save & sync my notes"): commits every uncommitted
 * change in the brain and pushes. Runs in the worker, so it never overlaps an agent's git work.
 */
export function runNotesSyncJob(deps: Pick<RunDeps, "db" | "root" | "now">, job: Job): void {
  const changes = changedPaths(deps.root);
  if (changes.length === 0) {
    addEvent(deps.db, job.id, "status", "Nothing to save", deps.now());
    finishJob(deps.db, job.id, "ok", null, deps.now());
    return;
  }
  try {
    commitChanges(deps.root, changes.map((c) => c.path), `notes: owner update (${changes.length} file(s))`);
  } catch (error) {
    const message = `Could not commit notes: ${(error as Error).message}`;
    addEvent(deps.db, job.id, "error", message, deps.now());
    finishJob(deps.db, job.id, "failed", message, deps.now());
    return;
  }
  addEvent(deps.db, job.id, "status", `Saved ${changes.length} file(s)`, deps.now());
  runPushJob(deps, job);
}

/** Retries pushing local brain commits (queued from the "not synced" banner). */
export function runPushJob(deps: Pick<RunDeps, "db" | "root" | "now">, job: Job): void {
  const push = pushBrain(deps.root);
  if (push.ok) {
    addEvent(deps.db, job.id, "status", "Pushed to the brain repository", deps.now());
    finishJob(deps.db, job.id, "ok", null, deps.now());
  } else {
    addEvent(deps.db, job.id, "error", push.error, deps.now());
    finishJob(deps.db, job.id, "failed", `Push failed: ${push.error}`, deps.now());
  }
}
```

- [ ] **Step 4: Implement `worker/index.ts`**

```ts
// Harbour worker: runs queued agent jobs one at a time. Started by systemd (`pnpm worker`).
// Must not import any module that imports "server-only".
import { runProcess } from "@/lib/agents/process";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { housekeepingAction } from "@/lib/jobs/housekeeping";
import { claimNextJob, enqueueJob, heartbeat, recoverStaleJobs } from "@/lib/jobs/queue";
import { runAgentJob, runNotesSyncJob, runPushJob } from "@/lib/jobs/run-job";
import { getProducts } from "@/lib/products/catalog";

const IDLE_MS = 2000;
const HEARTBEAT_MS = 10_000;
const AUTOSAVE_CHECK_MS = 30_000;
const AUTOSAVE_QUIET_MS = 2 * 60_000;
const PUSH_RETRY_MS = 10 * 60_000;

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const config = getConfig();
  const db = getDb();
  const recovered = recoverStaleJobs(db);
  if (recovered > 0) console.warn(`recovered ${recovered} stale job(s)`);
  console.log("harbour-worker ready");

  let lastHousekeeping = 0;
  let lastPushRetry = 0;
  while (!stopping) {
    if (Date.now() - lastHousekeeping >= AUTOSAVE_CHECK_MS) {
      lastHousekeeping = Date.now();
      const action = housekeepingAction(config.HARBOUR_BRAIN_DIR, new Date(), {
        quietMs: AUTOSAVE_QUIET_MS,
        pushRetryDue: Date.now() - lastPushRetry >= PUSH_RETRY_MS,
      });
      if (action === "notes-sync") enqueueJob(db, "notes-sync", {}, null);
      if (action === "brain-push") {
        lastPushRetry = Date.now();
        enqueueJob(db, "brain-push", {}, null);
      }
    }
    const job = claimNextJob(db);
    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }
    console.log(`job ${job.id} (${job.kind}) started`);
    const beat = setInterval(() => heartbeat(db, job.id), HEARTBEAT_MS);
    try {
      const now = () => new Date();
      if (job.kind === "brain-push") {
        runPushJob({ db, root: config.HARBOUR_BRAIN_DIR, now }, job);
      } else if (job.kind === "notes-sync") {
        runNotesSyncJob({ db, root: config.HARBOUR_BRAIN_DIR, now }, job);
      } else {
        await runAgentJob(
          {
            db,
            root: config.HARBOUR_BRAIN_DIR,
            bin: config.HARBOUR_CLAUDE_BIN,
            token: config.HARBOUR_CLAUDE_OAUTH_TOKEN,
            model: config.HARBOUR_AGENT_MODEL,
            timeoutMs: config.HARBOUR_AGENT_TIMEOUT_MINUTES * 60_000,
            products: getProducts(),
            today: isoDateIn(config.HARBOUR_TIMEZONE, new Date()),
            home: process.env.HOME ?? "",
            path: process.env.PATH ?? "",
            run: runProcess,
            now,
          },
          job,
        );
      }
    } finally {
      clearInterval(beat);
      console.log(`job ${job.id} finished`);
    }
  }
}

main().catch((error) => {
  console.error("harbour-worker crashed", error);
  process.exit(1);
});
```

`package.json` scripts: `"worker": "tsx --env-file=.env worker/index.ts"`. (`.env` must exist; for E2E the worker is started with explicit env — see Task 11.)

Verify `lib/products/catalog.ts` and its imports do not import `server-only`; if they do, move the `server-only` import to a page-level module and note it.

- [ ] **Step 5: Run, gate, commit**

Run: `pnpm vitest run lib/jobs lib/agents && pnpm check` → PASS. Then smoke-start the worker against a scratch config for 3 s and stop it by PID:
```bash
HARBOUR_DB_PATH=./data/worker-smoke.db HARBOUR_BRAIN_DIR=./tests/fixtures/brain HARBOUR_ALLOWED_LOGINS=owner@example.com HARBOUR_ORIGIN=http://localhost:3400 HARBOUR_RP_ID=localhost npx tsx worker/index.ts & PID=$!; sleep 3; kill $PID; wait $PID; rm -f data/worker-smoke.db*
```
Expected: prints `harbour-worker ready`, exits cleanly on SIGTERM.
```bash
git add lib/jobs worker package.json
git commit -m "feat(agents): job orchestration with git gate, proposals import and the worker"
```

---

### Task 8: Agents page and API

**Files:**
- Create: `app/api/agents/run/route.ts`, `app/api/agents/[id]/route.ts`, `app/api/agents/[id]/cancel/route.ts`, `app/api/agents/brain-push/route.ts`, `app/api/agents/notes-sync/route.ts`, `app/api/agents/routes.test.ts`, `app/(app)/agents/page.tsx`, `app/(app)/agents/[id]/page.tsx`, `components/agents/RunPanel.tsx`, `components/agents/JobList.tsx`, `components/agents/RunActivity.tsx`, `components/agents/BrainSyncBanner.tsx`, `lib/agents/view.ts`
- Modify: `components/shell/nav-items.ts` (Agents → `/agents`), `app/(app)/brain/layout.tsx` (widen: replace `mx-auto max-w-6xl` with `max-w-7xl`), `README.md`

**Interfaces:**
- Consumes: queue functions, `RESEARCH_TOPICS`, `getProducts`, `unpushedCount`, `getConfig`, `audit`, `getSession`, `requireSession`, `rejectCrossSite`, `jsonError`, `postJson`.
- Produces:
  - `POST /api/agents/run` body `{ kind: "research", topic: string | "all" } | { kind: "discovery", productId: string }` → `{ jobIds: number[] }` (400 unknown topic/product; audits `agent_run_requested`)
  - `GET /api/agents/[id]?after=<eventId>` → `{ job: { id, kind, status, error, label, createdAt, startedAt, finishedAt }, events: { id, at, kind, text }[] }`
  - `POST /api/agents/[id]/cancel` → `{ result: "cancelled" | "requested" | "not-active" }` (audits `agent_run_cancelled`)
  - `POST /api/agents/brain-push` → `{ jobId: number }`
  - `POST /api/agents/notes-sync` → `{ jobId: number }` (same guards as brain-push; enqueues `notes-sync`)
  - `jobLabel(job: Job, products): string` in `lib/agents/view.ts`

- [ ] **Step 1: Failing route tests `app/api/agents/routes.test.ts`**

Follow the existing pattern in `app/api/brain/routes.test.ts` (mock `@/lib/auth/guard` `getSession`; build requests with `Origin` = config origin and JSON content type; use an in-memory DB by mocking `@/lib/db/client` `getDb` to return `openTestDb()`; mock `@/lib/products/catalog` `getProducts` to return the fictional `acme-docs` product). Cases:
```ts
// run: 401 without session; 403 cross-site; 400 unknown topic; topic "all" queues 10 jobs (ids returned);
//      discovery for acme-docs queues one; a second identical request returns the same id (dedupe).
// [id]: 401 without session; 404 unknown id; returns events after `after`.
// cancel: 403 cross-site; queued job → "cancelled".
// brain-push: queues a brain-push job.
// notes-sync: 401 without session; 403 cross-site; queues a notes-sync job (deduped).
```
Write each as a concrete `it(...)` with assertions on `response.status` and JSON bodies.

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement `lib/agents/view.ts`**

```ts
import type { Job } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import { RESEARCH_TOPICS } from "./topics";

/** Human label for a job, e.g. "Research: Glossary". */
export function jobLabel(job: Pick<Job, "kind" | "params">, products: readonly Product[]): string {
  if (job.kind === "research") return `Research: ${RESEARCH_TOPICS.find((t) => t.id === job.params.topic)?.title ?? job.params.topic}`;
  if (job.kind === "discovery") return `Discovery: ${products.find((p) => p.id === job.params.productId)?.name ?? job.params.productId}`;
  return "Sync brain to GitHub";
}
```

- [ ] **Step 4: Implement the routes**

`app/api/agents/run/route.ts`:
```ts
import { z } from "zod";
import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { enqueueJob } from "@/lib/jobs/queue";
import { getProducts } from "@/lib/products/catalog";

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("research"), topic: z.string().min(1) }),
  z.object({ kind: z.literal("discovery"), productId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const db = getDb();
  const enqueue = (kind: "research" | "discovery", params: Record<string, string>) =>
    enqueueJob(db, kind, params, session.login).id;
  let jobIds: number[];
  if (body.data.kind === "research") {
    const { topic } = body.data;
    if (topic !== "all" && !RESEARCH_TOPICS.some((t) => t.id === topic)) return jsonError(400, "unknown_topic");
    const topics = topic === "all" ? RESEARCH_TOPICS.map((t) => t.id) : [topic];
    jobIds = topics.map((id) => enqueue("research", { topic: id }));
  } else {
    const { productId } = body.data;
    if (!getProducts().some((p) => p.id === productId)) return jsonError(400, "unknown_product");
    jobIds = [enqueue("discovery", { productId })];
  }
  audit(db, { login: session.login, event: "agent_run_requested", detail: { ...body.data, jobIds } });
  return Response.json({ jobIds });
}
```

`app/api/agents/[id]/route.ts`:
```ts
import { jobLabel } from "@/lib/agents/view";
import { getSession } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { eventsSince, getJob } from "@/lib/jobs/queue";
import { getProducts } from "@/lib/products/catalog";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return jsonError(401, "unauthenticated");
  const id = Number((await params).id);
  const db = getDb();
  const job = Number.isInteger(id) ? getJob(db, id) : undefined;
  if (!job) return jsonError(404, "not_found");
  const after = Number(new URL(request.url).searchParams.get("after") ?? "0") || 0;
  const { kind, status, error, createdAt, startedAt, finishedAt } = job;
  return Response.json({
    job: { id, kind, status, error, label: jobLabel(job, getProducts()), createdAt, startedAt, finishedAt },
    events: eventsSince(db, id, after),
  });
}
```

`app/api/agents/[id]/cancel/route.ts`:
```ts
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { requestCancel } from "@/lib/jobs/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return jsonError(404, "not_found");
  const db = getDb();
  const result = requestCancel(db, id);
  if (result !== "not-active") audit(db, { login: session.login, event: "agent_run_cancelled", detail: { jobId: id } });
  return Response.json({ result });
}
```

`app/api/agents/brain-push/route.ts`:
```ts
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { enqueueJob } from "@/lib/jobs/queue";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  return Response.json({ jobId: enqueueJob(getDb(), "brain-push", {}, session.login).id });
}
```

- [ ] **Step 5: Components**

`components/agents/RunPanel.tsx` — client component listing `RESEARCH_TOPICS` (title + "Run") with a "Run all research topics" primary button, and one "Run discovery" button per product (props: `products: { id: string; name: string }[]`, `tokenSet: boolean`). Buttons call `postJson("/api/agents/run", …)`; on success `router.push("/agents/" + jobIds[0])` for single runs or `router.refresh()` for "all"; on failure show `role="alert"` text in `text-bad`. When `tokenSet` is false, render a `role="note"` panel (`bg-warn-soft text-warn`): "Agents need a Claude token. Run `claude setup-token` on the Harbour PC, add `HARBOUR_CLAUDE_OAUTH_TOKEN=…` to `.env`, then restart the worker." and disable the buttons.

`components/agents/JobList.tsx` — server component: a `<table aria-label="Agent runs">` with columns Run (link to `/agents/[id]` using `jobLabel`), Status (Tag: ok→accent, failed→warn, running/queued→neutral, cancelled→neutral), Started (formatDateTime with tz/locale props), Duration (`finishedAt - startedAt` in minutes/seconds, or "—").

`components/agents/RunActivity.tsx` — client component (props: initial job + events). Polls `GET /api/agents/[id]?after=<lastEventId>` every 2 s while status is `queued` or `running`, appends events, stops when finished. Renders status line (`aria-live="polite"`), elapsed time, an ordered list of events (error kind in `text-bad`, tool in `text-ink-muted`, status in `text-ink`), and a "Cancel" ghost button (POST cancel) while active. Shows `job.error` in a `role="alert"` box when failed.

`components/agents/BrainSyncBanner.tsx` — client component (props `unpushed: number`, `unsaved: number`). When `unsaved > 0`: "N note file(s) will be saved automatically in about 2 minutes" + an optional "Save now" button → POST `/api/agents/notes-sync`, then `router.push("/agents/" + jobId)`. When `unpushed > 0`: "N brain commit(s) waiting to sync to GitHub — retrying automatically" + an optional "Retry now" → POST `/api/agents/brain-push`, then `router.refresh()`. When both are 0 render a quiet "Saved · synced" line in `text-ink-muted`. Also render this banner at the top of the Second Brain layout (`app/(app)/brain/layout.tsx`), computing the counts with `changedPaths`/`unpushedCount` (both are plain modules without "server-only").

Keep each file under 200 lines; use semantic tokens only.

- [ ] **Step 6: Pages**

`app/(app)/agents/page.tsx`:
```tsx
import { BrainSyncBanner } from "@/components/agents/BrainSyncBanner";
import { JobList } from "@/components/agents/JobList";
import { RunPanel } from "@/components/agents/RunPanel";
import { changedPaths, unpushedCount } from "@/lib/agents/brain-git";
import { requireSession } from "@/lib/auth/guard";
import { checkBrainRoot } from "@/lib/brain/docs";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { listJobs } from "@/lib/jobs/queue";
import { getProducts } from "@/lib/products/catalog";

export default async function AgentsPage() {
  await requireSession();
  const config = getConfig();
  const products = getProducts();
  const brainOk = checkBrainRoot(config.HARBOUR_BRAIN_DIR).ok;
  const unpushed = brainOk ? (unpushedCount(config.HARBOUR_BRAIN_DIR) ?? 0) : 0;
  const unsaved = brainOk ? changedPaths(config.HARBOUR_BRAIN_DIR).length : 0;
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl">Agents</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Research and discovery agents write into your Second Brain. One runs at a time.
        </p>
      </header>
      <BrainSyncBanner unpushed={unpushed} unsaved={unsaved} />
      <RunPanel products={products.map(({ id, name }) => ({ id, name }))} tokenSet={Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN)} />
      <JobList jobs={listJobs(getDb())} products={products} timeZone={config.HARBOUR_TIMEZONE} locale={config.HARBOUR_LOCALE} />
    </div>
  );
}
```

`app/(app)/agents/[id]/page.tsx`: `requireSession()`; parse id; `getJob` else `notFound()`; render header with `jobLabel`, then `<RunActivity>` with the job (serialisable fields) and `eventsSince(db, id, 0)`; a "Back to agents" link. If `agentRuns.commitSha` exists show the files changed as links into `/brain/...` (use `brainHref`).

`nav-items.ts`: `{ label: "Agents", href: "/agents" }`.

Brain layout widening: in `app/(app)/brain/layout.tsx` replace `mx-auto max-w-6xl` with `max-w-7xl` so the viewer sits beside the sidebar on wide screens.

README: add an "Agents" section — what runs, the token setup (`claude setup-token` → `.env`), that agents only have web research and brain-file tools, the git gate (out-of-area changes discarded), one run at a time, cancel, and sync retry.

- [ ] **Step 7: Run, gate, commit**

Run: `pnpm vitest run app/api/agents && pnpm check && pnpm build` → PASS; build lists `/agents`, `/agents/[id]` and the five agent API routes.
```bash
git add app components lib README.md
git commit -m "feat(agents): agents page with run buttons, live activity, cancel and sync retry"
```

---

### Task 9: Approval screens

**Files:**
- Create: `app/api/products/[id]/proposals/route.ts`, `app/api/products/routes.test.ts`, `app/(app)/settings/products/[id]/page.tsx`, `components/proposals/ProposalList.tsx`, `components/proposals/ProposalItem.tsx`, `components/proposals/ProposalList.test.tsx`
- Modify: `components/shell/Sidebar.tsx` (product links → `/settings/products/[id]`), `README.md`

**Interfaces:**
- Consumes: Task 6 functions; `productById`/`getProducts`.
- Produces: `POST /api/products/[id]/proposals` body `{ action: "approve" | "reject", proposalId: number } | { action: "edit", proposalId: number, value: Record<string, string> } | { action: "approve-all", type: ProposalType }` → `{ ok: true, count?: number }` or error JSON (404 unknown product/proposal, 400 invalid edit with `{ error: "invalid_edit", message }`). Audits `proposal_decided` with `{ productId, action, proposalId?, type? }`.

- [ ] **Step 1: Failing tests**

`app/api/products/routes.test.ts` (same mocking pattern as Task 8): 401 without session; 403 cross-site; 404 unknown product; approve → row status approved; reject; edit valid → edited; edit invalid → 400 `invalid_edit`; approve-all → count.

`components/proposals/ProposalList.test.tsx` (`// @vitest-environment jsdom`; mock `next/navigation` and `@/lib/auth/client-api` `postJson`): renders a keyword list with term, intent, why and status; clicking "Approve" posts `{ action: "approve", proposalId }`; "Approve all proposed" posts `{ action: "approve-all", type: "keyword" }`; an edit form saves `{ action: "edit", … }` and a 400 response shows the message in `role="alert"`.

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement the route**

```ts
import { z } from "zod";
import { approveAllProposed, decideProposal, editProposal } from "@/lib/agents/proposals";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { getProducts } from "@/lib/products/catalog";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["approve", "reject"]), proposalId: z.number().int() }),
  z.object({ action: z.literal("edit"), proposalId: z.number().int(), value: z.record(z.string(), z.string()) }),
  z.object({ action: z.literal("approve-all"), type: z.enum(["keyword", "question", "competitor"]) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const productId = (await params).id;
  if (!getProducts().some((p) => p.id === productId)) return jsonError(404, "not_found");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const db = getDb();
  const record = (detail: Record<string, unknown>) =>
    audit(db, { login: session.login, event: "proposal_decided", detail: { productId, ...detail } });
  const data = body.data;
  if (data.action === "approve-all") {
    const count = approveAllProposed(db, productId, data.type);
    record({ action: data.action, type: data.type, count });
    return Response.json({ ok: true, count });
  }
  if (data.action === "edit") {
    const result = editProposal(db, productId, data.proposalId, data.value);
    if (!result.ok) {
      return result.error === "not_found"
        ? jsonError(404, "not_found")
        : Response.json({ error: "invalid_edit", message: result.error }, { status: 400 });
    }
    record({ action: data.action, proposalId: data.proposalId });
    return Response.json({ ok: true });
  }
  const status = data.action === "approve" ? "approved" : "rejected";
  if (!decideProposal(db, productId, data.proposalId, status)) return jsonError(404, "not_found");
  record({ action: data.action, proposalId: data.proposalId });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: UI**

`app/(app)/settings/products/[id]/page.tsx`: `requireSession()`; product via `getProducts().find` else `notFound()`; `listProposals(getDb(), id)`; header "{name} — research targets" with the product URL; three `<section>`s ("Keywords", "AI questions", "Competitors"), each rendering `<ProposalList type=… productId=… items=… />`; empty state per list: "No proposals yet — run discovery for {name} on the Agents page." (link to `/agents`).

`components/proposals/ProposalList.tsx` (client): header with counts (proposed/approved/rejected) and an "Approve all proposed" button (hidden when none proposed); list of `ProposalItem`.

`components/proposals/ProposalItem.tsx` (client): shows the value (keyword: term + intent Tag + location; question: text; competitor: name + external link with `rel="noopener noreferrer" target="_blank"`), the "why" in `text-ink-muted`, status Tag, and buttons Approve / Reject / Edit (accessible names include the item, e.g. `Approve keyword "example widgets"`). Edit shows inline labelled inputs for the value fields and Save/Cancel; errors in `role="alert"`. After any successful action `router.refresh()`.

Sidebar: product entries become `NavLink href={`/settings/products/${product.id}`}` (no longer "soon").

README: describe approving discovery results under each product.

- [ ] **Step 5: Run, gate, commit**

Run: `pnpm vitest run app/api/products components/proposals && pnpm check` → PASS.
```bash
git add app components README.md
git commit -m "feat(agents): approve, edit and reject discovery proposals per product"
```

---

### Task 10: Deployment — worker service

**Files:**
- Create: `deploy/harbour-worker.service.template`
- Modify: `deploy/install.sh`, `deploy/README.md`, `README.md`

**Interfaces:**
- Produces: systemd user unit `harbour-worker.service` running `pnpm worker` in the repo with `Restart=always`.

- [ ] **Step 1: `deploy/harbour-worker.service.template`**

```ini
[Unit]
Description=Harbour worker (runs agent jobs)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=__REPO__
Environment=NODE_ENV=production
Environment=PATH=__NODE_BIN__:/usr/bin:/bin
ExecStart=__NODE_BIN__/pnpm worker
Restart=always
RestartSec=5
# Agents run as child processes; stopping the worker stops the whole group.
KillMode=control-group
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
```

- [ ] **Step 2: `deploy/install.sh`** — after rendering `harbour-web.service`, render `harbour-worker.service` from its template the same way, then:
```bash
systemctl --user daemon-reload
systemctl --user enable --now harbour-web.service harbour-worker.service
systemctl --user restart harbour-web.service harbour-worker.service
```
Add a non-fatal note at the end when `HARBOUR_CLAUDE_OAUTH_TOKEN` is missing from `.env`:
```bash
grep -q "^HARBOUR_CLAUDE_OAUTH_TOKEN=." "$REPO/.env" || echo "Agents are disabled until you add HARBOUR_CLAUDE_OAUTH_TOKEN to .env (run: claude setup-token), then: systemctl --user restart harbour-worker"
```
Verify `bash -n deploy/install.sh`. Do NOT run it.

- [ ] **Step 3: Docs** — `deploy/README.md`: a "Worker and agents" section: what the worker does, `claude setup-token` → `.env` (`HARBOUR_CLAUDE_OAUTH_TOKEN=`), `systemctl --user restart harbour-worker`, logs `journalctl --user -u harbour-worker -f`, and that the brain repo must be pushable non-interactively by the worker (test with `git -C <brain> push --dry-run` from a non-interactive shell; if it prompts, set up a credential helper or SSH remote). Update the "Updating" command to restart both services.

- [ ] **Step 4: First-run script**

`scripts/queue-initial-run.ts` (script `"agents:initial-run": "tsx --env-file=.env scripts/queue-initial-run.ts"`): enqueues every research topic, then discovery for every configured product (queue order = run order), printing the job ids. Idempotent thanks to `enqueueJob` dedupe. Add a unit test that calls its exported `queueInitialRun(db, products)` against an in-memory DB and asserts 10 research jobs followed by one discovery job per product. The controller runs it once after the first 2b deploy (owner chose "run everything").

- [ ] **Step 5: Gate and commit**

Run: `pnpm check` → PASS.
```bash
git add deploy README.md scripts package.json
git commit -m "chore(deploy): run the agent worker as a systemd user service"
```

---

### Task 11: End-to-end coverage with the fake CLI

**Files:**
- Create: `tests/e2e/prepare.ts`, `tests/e2e/agents.spec.ts`, `tests/fixtures/brain/products/acme-docs/notes.md`
- Modify: `package.json` (`test:e2e`), `playwright.config.ts`

**Interfaces:**
- Consumes: everything above; fake CLI from Task 3.

- [ ] **Step 1: Fixture and prepare script**

`tests/fixtures/brain/products/acme-docs/notes.md`:
```markdown
# Acme Docs — notes

Fictional product used by end-to-end tests. Audience: technical writers.
```

`tests/e2e/prepare.ts` — runs before Playwright; creates a git-backed copy of the fixture brain with a bare remote:
```ts
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const BRAIN = "./data/e2e-brain";
const REMOTE = "./data/e2e-brain-remote.git";
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore" });

rmSync(BRAIN, { recursive: true, force: true });
rmSync(REMOTE, { recursive: true, force: true });
mkdirSync("./data", { recursive: true });
cpSync("./tests/fixtures/brain", BRAIN, { recursive: true });
git(".", "init", "-q", "--bare", "-b", "main", REMOTE);
git(BRAIN, "init", "-q", "-b", "main");
git(BRAIN, "config", "user.name", "E2E Owner");
git(BRAIN, "config", "user.email", "owner@example.com");
git(BRAIN, "add", "-A");
git(BRAIN, "commit", "-q", "-m", "fixture");
git(BRAIN, "remote", "add", "origin", "../e2e-brain-remote.git");
git(BRAIN, "push", "-q", "-u", "origin", "main");
```

`package.json`: `"test:e2e": "tsx tests/e2e/prepare.ts && playwright test"`.

- [ ] **Step 2: `playwright.config.ts`** — make `webServer` an array: the existing web server (change `HARBOUR_BRAIN_DIR` to `./data/e2e-brain`), plus a worker:
```ts
    {
      command: "npx tsx worker/index.ts",
      // The worker has no HTTP port; Playwright needs a URL, so reuse the web server's.
      url: `http://127.0.0.1:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: "production",
        HARBOUR_ALLOWED_LOGINS: E2E_LOGIN,
        HARBOUR_ORIGIN: E2E_ORIGIN,
        HARBOUR_RP_ID: "localhost",
        HARBOUR_DB_PATH: E2E_DB,
        HARBOUR_BRAIN_DIR: "./data/e2e-brain",
        HARBOUR_CONFIG_PATH: "./harbour.config.example.json",
        HARBOUR_CLAUDE_BIN: `${process.cwd()}/tests/fixtures/fake-claude.mjs`,
        HARBOUR_CLAUDE_OAUTH_TOKEN: "e2e-fake-token",
        HARBOUR_AGENT_TIMEOUT_MINUTES: "1",
      },
    },
```
(Keep the web server's env identical apart from `HARBOUR_BRAIN_DIR`, and add `HARBOUR_CLAUDE_OAUTH_TOKEN: "e2e-fake-token"` to it so the Agents page shows the run buttons enabled.)

- [ ] **Step 3: `tests/e2e/agents.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

test("a research run streams activity, commits, and the document appears in the brain", async ({ page }) => {
  await page.goto("/agents");
  await page.getByRole("button", { name: /Run.*Glossary/ }).click();
  await expect(page).toHaveURL(/\/agents\/\d+$/);
  await expect(page.getByText("Searching: fake research query")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Pushed to the brain repository/)).toBeVisible({ timeout: 30_000 });
  await page.goto("/brain/research/glossary.md");
  await expect(page.getByRole("heading", { level: 1, name: /Fake research\/glossary\.md/ })).toBeVisible();
});

test("discovery proposals can be approved", async ({ page }) => {
  await page.goto("/agents");
  await page.getByRole("button", { name: /Run discovery.*Acme Docs/ }).click();
  await expect(page.getByText(/Imported 3 proposal/)).toBeVisible({ timeout: 30_000 });
  await page.goto("/settings/products/acme-docs");
  await page.getByRole("button", { name: 'Approve keyword "example widgets"' }).click();
  await expect(page.getByText("approved").first()).toBeVisible();
});

test("agent API requires a session", async ({ request }) => {
  // request fixture carries the identity header but use an empty cookie jar
  const response = await request.get("/api/agents/1", { headers: { cookie: "" } });
  expect([401, 404]).toContain(response.status());
});
```
Adjust the button accessible names to exactly what `RunPanel` renders (e.g. `Run Glossary`, `Run discovery for Acme Docs`) — keep assertions specific.

- [ ] **Step 4: Run**

Run: `pnpm test:e2e` → all pass (previous 24 + new). If the worker webServer entry can't share the URL probe, switch it to `port`-less mode supported by the installed Playwright (check docs) and note it.

- [ ] **Step 5: Gate and commit**

Run: `pnpm check` → PASS.
```bash
git add tests package.json playwright.config.ts
git commit -m "test(e2e): agents run end to end with a fake CLI and approvals"
```

---

### Task 12: Live verification (controller + owner, after deploy)

No code. The owner has authorised the controller to deploy (build, `./deploy/install.sh`, restart harbour-web/harbour-worker, push) and to start the full first run. The token is already in `.env`. Then:

- [ ] Deploy; verify both services are active, locks hold (loopback 403, `/agents` → login without session).
- [ ] Verify the worker can push the brain non-interactively: `systemd-run --user --wait --pipe git -C <brain> push --dry-run` (or equivalent under the service environment). Fix credentials per `deploy/README.md` if it prompts or fails.
- [ ] Run `pnpm agents:initial-run`; watch the first job finish `ok`, its commit appear in the brain repo, and push succeed.
- [ ] Confirm the agent could not write outside its area: `git -C <brain> show --stat HEAD` lists only `research/glossary.md`.
- [ ] Re-run the containment probe used during planning (a throwaway git dir as cwd, `claudeArgs()` flags, the real token from `.env` without printing it): reads/writes outside the cwd must appear in `permission_denials`; a read/write inside must succeed. Repeat after any Claude Code CLI upgrade.
- [ ] Monitor the run to completion; summarise results (docs written, proposals imported, any failures with causes) for the owner, who then reads the research and approves proposals in Settings.

---

## Spec coverage (Phase 2b)

| Spec item | Task |
|---|---|
| B1 worker service, job table, status flow, atomic claim, heartbeat, stale recovery, web only enqueues | 1, 7, 10 |
| B2 locked-down `claude -p` (tools, no settings/MCP/hooks), process group, cancel/timeout, capped output, event summary, git gate (restore out-of-area), commit + push, push-failure banner + retry | 2, 3, 4, 7, 8 |
| B3 Agents page: runs list, run buttons, live feed (2 s poll), cancel, files changed, logs | 8 |
| Owner notes: "Save & sync my notes" (commit + push via the worker), unsaved-notes banner on Agents and Second Brain | 7, 8 |
| B4 research sprint (10 topics incl. Preferred Sources), cited, frontmatter, products section | 5 |
| B5 discovery: notes required, discovery.md + proposals.json, zod validation, import as proposed, no overwrite | 5, 6, 7 |
| B6 approvals per product: approve/edit/reject/approve-all, audited | 9 |
| Token secrecy, minimal agent env | 1, 2, 8 |
| README/deploy docs | 1, 8, 9, 10 |

Spec note: B5 originally described three tables; the spec now records the single `proposals` table with a `type` column and a per-product unique key used here.
