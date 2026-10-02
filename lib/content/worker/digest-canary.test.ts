import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { eventsSince } from "@/lib/jobs/queue";
import { CANARY } from "@/tests/fixtures/content/hostile-snippets";
import { dumpDb, searchEverywhere } from "@/tests/helpers/content";
import { digest } from "@/tests/helpers/digest-run";

// Raw screen text must be found nowhere after a digest job, however it ends (spec §9.4).
let logs: string[] = [];
beforeEach(() => {
  logs = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

type Run = Awaited<ReturnType<typeof digest>>;

/**
 * Every place the canary could have landed: files under the brain, the bare remote, the folder
 * holding both (the quarantine lives there) and the skills; the git history of both repositories;
 * every database table; the job's events and error; the worker's log lines; the command line.
 */
function leaks(r: Run): string[] {
  const remote = (...args: string[]) =>
    execFileSync("git", args, { cwd: r.brain.remote, encoding: "utf8" });
  const events = eventsSince(r.deps.db, r.job.id, 0)
    .map((e) => e.text)
    .join("\n");
  const texts = [
    r.brain.git("log", "-p", "--all"),
    remote("log", "-p", "--all"),
    dumpDb(r.deps.db),
    events,
    r.job.error ?? "",
    logs.join("\n"),
    r.calls.map((c) => c.args.join(" ")).join("\n"),
  ];
  const roots = [
    r.brain.root,
    r.brain.remote,
    join(r.brain.remote, ".."),
    r.deps.content?.skillsDir,
  ];
  return searchEverywhere(
    CANARY,
    roots.filter((root): root is string => root !== undefined),
    texts,
  );
}

const STRAY_NAME = { [`research/${CANARY}.md`]: "x\n" };

describe("the canary", () => {
  it("is nowhere after a successful job, though the model saw it", async () => {
    const r = await digest();
    try {
      expect(r.job.status).toBe("ok");
      expect(r.calls[0]?.prompt).toContain(CANARY); // the model did see it: that is the point of the filter
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is nowhere when the agent repeats it in its text, tool input, result and stderr", async () => {
    const r = await digest({ echo: { text: CANARY } });
    try {
      expect(r.job.status).toBe("ok");
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is nowhere when a hostile agent also writes outside the brain and keys its work file by it", async () => {
    const r = await digest({ echo: { text: CANARY, hostile: true } });
    try {
      expect(r.job.status).toBe("failed");
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is nowhere when a failing agent repeats it everywhere", async () => {
    const r = await digest({ fixtures: {}, echo: { text: CANARY, hostile: true } });
    try {
      expect(r.job.status).toBe("failed");
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is nowhere when the agent names a file after it, in or out of an allowed folder", async () => {
    const strays = { ...STRAY_NAME, [`content/digests/${CANARY}.md`]: "x\n" };
    const r = await digest({ strays, echo: { text: CANARY } });
    try {
      expect(r.job.status).toBe("failed");
      expect(r.job.error).toMatch(/outside its area: 2 file\(s\)$/);
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is nowhere after bad JSON, an unfinished agent, or Screenpipe refusing", async () => {
    for (const options of [{ works: "{ nope" }, { fixtures: {} }, { mode: "forbidden" as const }]) {
      const r = await digest(options);
      try {
        expect(r.job.status).toBe("failed");
        expect(leaks(r)).toEqual([]);
      } finally {
        await r.cleanup();
      }
    }
  });

  it("is nowhere when the work file echoes it in a value and fails its schema", async () => {
    const r = await digest({ works: { themes: [], note: `Acme Docs notes ${CANARY}` } });
    try {
      expect(r.job.status).toBe("failed");
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is nowhere when the job fails after the text was read (a second product's request fails)", async () => {
    const r = await digest({ mode: "second-forbidden", twoProducts: true });
    try {
      expect(r.fake.requests.filter((q) => q.path === "/activity-summary")).toHaveLength(2);
      expect(r.job.status).toBe("failed");
      expect(r.calls).toHaveLength(0);
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });
});
