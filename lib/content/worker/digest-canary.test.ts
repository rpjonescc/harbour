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

/** Every place the canary could have landed; each entry is a path or "(text N)" for a text. */
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
    logs.join("\n"),
    r.job.error ?? "",
    JSON.stringify(r.fake.requests),
  ];
  // The brain, the bare remote, the folder holding both (the quarantine lives there) and the skills.
  const roots = [
    r.brain.root,
    r.brain.remote,
    join(r.brain.remote, ".."),
    r.deps.content?.skillsDir ?? "",
  ];
  return searchEverywhere(CANARY, roots.filter(Boolean), texts);
}

describe("the canary", () => {
  it("is nowhere after the job: not in the brain, its history, the remote, the database, events, logs or temp files", async () => {
    const r = await digest();
    try {
      expect(r.job.status).toBe("ok");
      expect(r.calls[0]?.prompt).toContain(CANARY); // the model did see it: that is the point of the filter
      // The only hit allowed is the request log of the fake server, which stands for Screenpipe itself.
      expect(leaks(r).filter((hit) => hit !== "(text 6)")).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is also gone after a failed run", async () => {
    const r = await digest({ works: "{ nope" });
    try {
      expect(r.job.status).toBe("failed");
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is gone when the agent did not finish", async () => {
    const r = await digest({ fixtures: {} });
    try {
      expect(r.job.status).toBe("failed");
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is gone when the work file fails its schema, even if it echoes the screen text", async () => {
    const r = await digest({ works: { themes: [], note: `Acme Docs notes ${CANARY}` } });
    try {
      expect(r.job.status).toBe("failed");
      // The agent's file is deleted with the run, not kept in quarantine.
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is gone when the agent obeys the injection and copies the screen text into another file", async () => {
    const r = await digest({ strays: { "research/x.md": `# ${CANARY}\n` } });
    try {
      expect(r.job.status).toBe("failed");
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("is gone when Screenpipe fails after the text was read", async () => {
    const r = await digest({ mode: "forbidden" });
    try {
      expect(r.job.status).toBe("failed");
      expect(leaks(r)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });
});
