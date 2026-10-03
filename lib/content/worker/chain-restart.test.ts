import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { enqueueContent } from "@/lib/content/limits";
import { readPieces } from "@/lib/content/read/pieces";
import { eventsSince, listJobs } from "@/lib/jobs/queue";
import { runAgentJob } from "@/lib/jobs/run-job";
import { runChain, seedPieces } from "@/tests/helpers/chain";
import { CHAIN_WORKS, contentSetup, ideaFile, VOICE_ACME } from "@/tests/helpers/content";
import { claim, runOne } from "@/tests/helpers/run-job";
import { afterContentJob, chainHook, resumeChains } from "./chain-controller";

const IDEA = "acme-docs-20261001-five-minutes";
const BASE = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "# Acme Docs\n\nA first deploy takes about five minutes.\n",
};
const beforeAtomise = () => ({
  ...BASE,
  ...Object.fromEntries(Object.entries(seedPieces(IDEA)).filter(([p]) => p.endsWith("/source.md"))),
  [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile({
    state: "drafting",
    sources: ["product:acme-docs"],
  }),
});
type S = ReturnType<typeof contentSetup>;
const deps = (s: S) => ({
  db: s.deps.db,
  root: s.brain.root,
  timeZone: "Europe/London",
  dailyRuns: 1,
  now: () => new Date(),
});
const queued = (s: S) =>
  listJobs(s.deps.db, 50)
    .filter((j) => j.status === "queued")
    .map((j) => `${j.kind}${j.params.gate ? `:${j.params.gate}:${j.params.attempt}` : ""}`);
const ranKinds = (s: S) =>
  listJobs(s.deps.db, 50)
    .reverse()
    .map((j) => `${j.kind}${j.params.gate ? `:${j.params.gate}:${j.params.attempt}` : ""}`);
const kick = (s: S, kind: "content-draft" | "content-atomise") =>
  enqueueContent(s.deps.db, {
    kind,
    params: { ideaId: IDEA },
    requestedBy: "me",
    timeZone: "Europe/London",
    now: new Date(),
    dailyRuns: 24,
  });
const events = (s: S, id: number) =>
  eventsSince(s.deps.db, id, 0)
    .map((e) => `${e.kind}: ${e.text}`)
    .join("\n");
const xFails = {
  pieces: CHAIN_WORKS["gate:no-ai-slop:1"].pieces.map((p) =>
    p.platform === "x"
      ? { ...p, findings: [{ pattern: "Colon reveals", quote: "q", fix: "f" }] }
      : p,
  ),
};

describe("the whole chain, through the real runner and controller", () => {
  it("runs draft, atomise, then all three gate runs, and ends with every piece Ready", async () => {
    const s = contentSetup(CHAIN_WORKS, {
      ...BASE,
      [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile(),
    });
    try {
      kick(s, "content-draft");
      await runChain(s, 6);
      expect(ranKinds(s)).toEqual([
        "content-draft",
        "content-atomise",
        "content-gate:no-ai-slop:1",
        "content-gate:humanizer:1",
        "content-gate:facts:1",
      ]);
      const pieces = readPieces(s.brain.root, IDEA).pieces;
      expect(pieces).toHaveLength(6);
      for (const p of pieces) {
        expect(p.front).toMatchObject({
          state: "ready",
          gates: { slop: "pass", humanizer: "pass", facts: "pass", platform: "pass" },
        });
        expect(p.gates.map((g) => g.gate)).toEqual([
          "no-ai-slop",
          "humanizer",
          "facts",
          "platform",
        ]);
      }
    } finally {
      s.cleanup();
    }
  });

  it("revises a failing piece once per gate, then moves on: at most two runs of each skill", async () => {
    const works = { ...CHAIN_WORKS, "gate:no-ai-slop:1": xFails, "gate:humanizer:1": xFails };
    const s = contentSetup(works, { ...BASE, ...beforeAtomise() });
    try {
      kick(s, "content-atomise");
      await runChain(s, 10);
      expect(ranKinds(s)).toEqual([
        "content-atomise",
        "content-gate:no-ai-slop:1",
        "content-gate:no-ai-slop:2",
        "content-gate:humanizer:1",
        "content-gate:humanizer:2",
        "content-gate:facts:1",
      ]);
      const x = readPieces(s.brain.root, IDEA).pieces.find((p) => p.platform === "x");
      expect(x?.gates.map((g) => `${g.gate}:${g.attempt}:${g.result}`)).toEqual([
        "no-ai-slop:1:fail",
        "no-ai-slop:2:revised",
        "humanizer:1:fail",
        "humanizer:2:revised",
        "facts:1:pass",
        "platform:1:pass",
      ]);
    } finally {
      s.cleanup();
    }
  });

  it("stops asking after the one revision even when it still fails", async () => {
    const stuck = { pieces: xFails.pieces.filter((p) => p.platform === "x") };
    const works = { ...CHAIN_WORKS, "gate:no-ai-slop:1": xFails, "gate:no-ai-slop:2": stuck };
    const s = contentSetup(works, { ...BASE, ...beforeAtomise() });
    try {
      kick(s, "content-atomise");
      await runChain(s, 10);
      expect(ranKinds(s).filter((k) => k.startsWith("content-gate:no-ai-slop"))).toEqual([
        "content-gate:no-ai-slop:1",
        "content-gate:no-ai-slop:2",
      ]);
      expect(
        readPieces(s.brain.root, IDEA).pieces.find((p) => p.platform === "x")?.front.gates.slop,
      ).toBe("fail");
    } finally {
      s.cleanup();
    }
  });
});

describe("the next step is queued by the transaction that finishes the job", () => {
  it("finishes the job and queues the step together", async () => {
    const s = contentSetup(CHAIN_WORKS, beforeAtomise());
    s.deps.afterOk = chainHook(deps(s));
    try {
      const job = await runOne(s.deps, "content-atomise", { ideaId: IDEA });
      expect(job.status).toBe("ok");
      expect(queued(s)).toEqual(["content-gate:no-ai-slop:1"]);
      expect(events(s, job.id)).toMatch(/Queued the next step/);
    } finally {
      s.cleanup();
    }
  });

  it("rolls the finish back when the next step cannot be queued: the job ends failed and nothing is queued", async () => {
    const s = contentSetup(CHAIN_WORKS, beforeAtomise());
    s.deps.afterOk = () => () => {
      throw new Error("the queue write failed");
    };
    try {
      const job = await runOne(s.deps, "content-atomise", { ideaId: IDEA });
      expect(job.status).not.toBe("ok");
      expect(queued(s)).toEqual([]);
    } finally {
      s.cleanup();
    }
  });

  it("finishes the job and says so when the next step cannot be worked out", async () => {
    const s = contentSetup(CHAIN_WORKS, beforeAtomise());
    s.deps.afterOk = () => {
      throw new Error("CANARY unreadable");
    };
    try {
      const job = await runOne(s.deps, "content-atomise", { ideaId: IDEA });
      expect(job.status).toBe("ok");
      expect(events(s, job.id)).toContain("The next step didn't start");
      expect(events(s, job.id)).not.toContain("CANARY");
      expect(queued(s)).toEqual([]);
    } finally {
      s.cleanup();
    }
  });
});

describe("after a restart", () => {
  it("queues the step a finished job never got to queue, once, and nothing after a failed one", async () => {
    const s = contentSetup(CHAIN_WORKS, beforeAtomise());
    try {
      kick(s, "content-atomise");
      await runAgentJob(s.deps, claim(s.deps)); // the worker died before the next step was queued
      expect(queued(s)).toEqual([]);
      expect(resumeChains(deps(s))).toBe(1);
      expect(queued(s)).toEqual(["content-gate:no-ai-slop:1"]);
      expect(resumeChains(deps(s))).toBe(0);
    } finally {
      s.cleanup();
    }
    const failed = contentSetup({}, beforeAtomise());
    try {
      kick(failed, "content-atomise");
      await runAgentJob(failed.deps, claim(failed.deps));
      expect(resumeChains(deps(failed))).toBe(0);
      expect(queued(failed)).toEqual([]);
    } finally {
      failed.cleanup();
    }
  });

  it("never queues a gate step that already ran to the end", async () => {
    const files = { ...BASE, ...seedPieces(IDEA) };
    const s = contentSetup(CHAIN_WORKS, files);
    try {
      const first = await runOne(s.deps, "content-gate", {
        ideaId: IDEA,
        gate: "no-ai-slop",
        attempt: "1",
      });
      expect(first.status).toBe("ok");
      for (const [path, text] of Object.entries(files))
        writeFileSync(join(s.brain.root, path), text); // the sidecars forget it ran
      s.brain.git("add", "-A");
      s.brain.git("commit", "-q", "-m", "restore");
      const second = await runOne(s.deps, "content-gate", {
        ideaId: IDEA,
        gate: "humanizer",
        attempt: "1",
      });
      expect(afterContentJob(deps(s), second)).toBe(false);
      expect(queued(s)).toEqual([]);
      expect(events(s, second.id)).toContain("already ran");
    } finally {
      s.cleanup();
    }
  });

  it("never repeats the step that just ran, so a mended sidecar cannot queue a duplicate attempt", async () => {
    const files = { ...BASE, ...seedPieces(IDEA) };
    const s = contentSetup(CHAIN_WORKS, files);
    try {
      const job = await runOne(s.deps, "content-gate", {
        ideaId: IDEA,
        gate: "no-ai-slop",
        attempt: "1",
      });
      for (const [path, text] of Object.entries(files))
        writeFileSync(join(s.brain.root, path), text);
      expect(afterContentJob(deps(s), job)).toBe(false);
      expect(queued(s)).toEqual([]);
      expect(events(s, job.id)).toContain("just ran");
    } finally {
      s.cleanup();
    }
  });

  it("resumes a chain whose hook failed: the job finished ok and nothing was queued", async () => {
    const s = contentSetup(CHAIN_WORKS, beforeAtomise());
    s.deps.afterOk = () => {
      throw new Error("unreadable");
    };
    try {
      const job = await runOne(s.deps, "content-atomise", { ideaId: IDEA });
      expect(job.status).toBe("ok");
      expect(queued(s)).toEqual([]);
      expect(resumeChains(deps(s))).toBe(1);
      expect(queued(s)).toEqual(["content-gate:no-ai-slop:1"]);
    } finally {
      s.cleanup();
    }
  });

  it("logs the kind of a resume failure, never its message, and records it on the job", async () => {
    const s = contentSetup(CHAIN_WORKS, beforeAtomise());
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      kick(s, "content-atomise");
      const job = claim(s.deps);
      await runAgentJob(s.deps, job); // finished; the next step was never queued
      const db = new Proxy(s.deps.db, {
        get: (target, key) =>
          key === "transaction"
            ? () => {
                throw new TypeError("CANARY private words");
              }
            : Reflect.get(target, key),
      });
      expect(resumeChains({ ...deps(s), db })).toBe(0);
      const lines = logged.mock.calls.map((call) => call.join(" "));
      expect(lines.some((line) => line.includes("TypeError"))).toBe(true);
      expect(lines.join("\n")).not.toContain("CANARY");
      expect(events(s, job.id)).toContain("couldn't work out the next step");
    } finally {
      logged.mockRestore();
      s.cleanup();
    }
  });
});
