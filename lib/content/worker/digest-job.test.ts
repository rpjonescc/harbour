import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFile } from "@/lib/content/files";
import { digestFrontmatter } from "@/lib/content/schema";
import { agentRuns } from "@/lib/db/schema";
import { enqueueJob, eventsSince } from "@/lib/jobs/queue";
import { CANARY } from "@/tests/fixtures/content/hostile-snippets";
import { contentSetup } from "@/tests/helpers/content";
import { DIGEST_DAY as DAY, digest, GOOD_THEMES as GOOD } from "@/tests/helpers/digest-run";
import { startFakeScreenpipe } from "@/tests/helpers/fake-screenpipe";
import { claim, reload } from "@/tests/helpers/run-job";
import { runDigestJob } from "./digest-job";

const FILE = `content/digests/${DAY}.md`;

describe("runDigestJob", () => {
  it("writes a digest of validated themes, from one health call and one activity call per product", async () => {
    const r = await digest();
    try {
      expect(r.job).toMatchObject({ status: "ok", error: null });
      expect(r.fake.requests.map((q) => q.path)).toEqual(["/health", "/activity-summary"]);
      const parsed = parseFile(readFileSync(join(r.brain.root, FILE), "utf8"), digestFrontmatter);
      expect(parsed.ok && parsed.value).toMatchObject({ status: "ok", date: DAY });
      expect(parsed.ok && parsed.value.themes.map((t) => t.id)).toEqual(["t1", "t2"]);
      expect(existsSync(join(r.brain.root, "content/work", `${r.job.id}.json`))).toBe(false);
      expect(r.brain.git("log", "-1", "--format=%s").trim()).toBe(`agent(content-digest): ${DAY}`);
      expect(r.calls).toHaveLength(1);
      expect(r.calls[0]?.tools).toBe("Write");
    } finally {
      await r.cleanup();
    }
  });

  it("drops a theme that fails the privacy check, counts it in an event, and marks the digest partial", async () => {
    const bad = {
      productId: "acme-docs",
      text: "Rewrote the guide and linked https://attacker.example/x for context",
      kind: "built",
    };
    const r = await digest({ works: { themes: [...GOOD, bad] } });
    try {
      const text = readFileSync(join(r.brain.root, FILE), "utf8");
      expect(text).toContain("status: partial");
      expect(text).not.toContain("attacker.example");
      const events = eventsSince(r.deps.db, r.job.id, 0).map((e) => e.text);
      expect(events).toContain("2 theme(s) for Acme Docs, 1 dropped by the privacy check");
    } finally {
      await r.cleanup();
    }
  });

  it("keeps the run record to status and tool events: no model text, no paths, no output tails", async () => {
    const r = await digest();
    try {
      const events = eventsSince(r.deps.db, r.job.id, 0);
      expect(events.some((e) => e.kind === "text")).toBe(false);
      expect(events.filter((e) => e.kind === "tool").every((e) => e.text === "Used a tool")).toBe(
        true,
      );
      expect(r.deps.db.select().from(agentRuns).get()).toMatchObject({
        stdoutTail: "(not recorded)",
        stderrTail: "(not recorded)",
      });
    } finally {
      await r.cleanup();
    }
  });

  it("tells the agent how many snippets it was given, never what they said", async () => {
    const r = await digest();
    try {
      const text = eventsSince(r.deps.db, r.job.id, 0).map((e) => e.text);
      expect(text.some((t) => /^Read \d+ snippet\(s\) for acme-docs$/.test(t))).toBe(true);
    } finally {
      await r.cleanup();
    }
  });

  it("fails an agent that obeys the injected instruction by writing another file, and keeps the brain clean", async () => {
    const r = await digest({ strays: { "research/x.md": "# stolen\n" } });
    try {
      expect(r.job.status).toBe("failed");
      expect(r.job.error).toMatch(/outside its area/);
      expect(existsSync(join(r.brain.root, "research/x.md"))).toBe(false);
      expect(existsSync(join(r.brain.root, FILE))).toBe(false);
      expect(r.brain.git("status", "--porcelain").trim()).toBe("");
    } finally {
      await r.cleanup();
    }
  });

  it("fails an agent that did not finish with a fixed sentence, not the agent's own words", async () => {
    const r = await digest({ fixtures: {} });
    try {
      expect(r.job).toMatchObject({ status: "failed", error: "The digest agent didn't finish." });
      expect(
        eventsSince(r.deps.db, r.job.id, 0)
          .map((e) => e.text)
          .join("\n"),
      ).not.toContain("no fixture");
      expect(existsSync(join(r.brain.root, FILE))).toBe(false);
    } finally {
      await r.cleanup();
    }
  });

  it.each([
    ["unhealthy", /isn't running, so there is no activity digest for 1 October/],
    ["forbidden", /screenpipe auth token/],
    ["not-recording", /wasn't recording on 1 October/],
    ["no-capture", /captured nothing on 1 October/],
    ["garbage", /wasn't in the expected shape/],
    ["redirect", /somewhere else/],
  ] as const)(
    "a %s Screenpipe fails the job with a plain reason, no file and no agent run",
    async (mode, reason) => {
      const r = await digest({ mode });
      try {
        expect(r.job.status).toBe("failed");
        expect(r.job.error).toMatch(reason);
        expect(r.calls).toHaveLength(0);
        expect(existsSync(join(r.brain.root, FILE))).toBe(false);
        expect(r.brain.git("status", "--porcelain").trim()).toBe("");
      } finally {
        await r.cleanup();
      }
    },
  );

  it("finishes ok with an event and no file when nothing on topic survives", async () => {
    const fake = await startFakeScreenpipe({
      snippets: [{ text: "Holiday plans", app_name: "Notes" }],
    });
    const s = contentSetup({ digest: { themes: GOOD } });
    try {
      enqueueJob(s.deps.db, "content-digest", { day: DAY }, null);
      const job = claim(s.deps);
      await runDigestJob(
        { ...s.deps, screenpipe: { baseUrl: fake.url, apiKey: "sp-test-key" } },
        job,
      );
      expect(reload(s.deps, job.id).status).toBe("ok");
      expect(s.calls).toHaveLength(0);
      const events = eventsSince(s.deps.db, job.id, 0).map((e) => e.text);
      expect(events.join("\n")).toMatch(/No on-topic activity/);
      expect(existsSync(join(s.brain.root, FILE))).toBe(false);
    } finally {
      await fake.close();
      s.cleanup();
    }
  });

  it("drops on-topic snippets that have no window title (it cannot be checked, so it is private)", async () => {
    const r = await digest({
      snippets: [{ text: "Acme Docs guide rewrite", app_name: "Editor", window_name: null }],
    });
    try {
      expect(r.job.status).toBe("ok");
      expect(r.calls).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("fails plainly when no Screenpipe key is set", async () => {
    const s = contentSetup({ digest: { themes: GOOD } });
    try {
      enqueueJob(s.deps.db, "content-digest", { day: DAY }, null);
      const job = claim(s.deps);
      await runDigestJob({ ...s.deps, screenpipe: null }, job);
      expect(reload(s.deps, job.id)).toMatchObject({ status: "failed" });
      expect(reload(s.deps, job.id).error).toMatch(/Connect Screenpipe/);
    } finally {
      s.cleanup();
    }
  });

  it("fails plainly, and calls nothing, when the content machine is off", async () => {
    const fake = await startFakeScreenpipe({});
    const s = contentSetup({ digest: { themes: GOOD } });
    try {
      s.deps.content = undefined;
      enqueueJob(s.deps.db, "content-digest", { day: DAY }, null);
      const job = claim(s.deps);
      await runDigestJob({ ...s.deps, screenpipe: { baseUrl: fake.url, apiKey: "k" } }, job);
      expect(reload(s.deps, job.id).error).toMatch(/content machine is off/);
      expect(fake.requests).toEqual([]);
    } finally {
      await fake.close();
      s.cleanup();
    }
  });

  it.each(["2026-13-45", "../../etc", "", "2026-02-30"])(
    "fails a job whose day is %j before reading anything",
    async (day) => {
      const fake = await startFakeScreenpipe({});
      const s = contentSetup({ digest: { themes: GOOD } });
      try {
        enqueueJob(s.deps.db, "content-digest", { day }, null);
        const job = claim(s.deps);
        await runDigestJob({ ...s.deps, screenpipe: { baseUrl: fake.url, apiKey: "k" } }, job);
        expect(reload(s.deps, job.id)).toMatchObject({
          status: "failed",
          error: "The digest day is not a date.",
        });
        expect(fake.requests).toEqual([]);
      } finally {
        await fake.close();
        s.cleanup();
      }
    },
  );

  it("finishes the job as failed, never leaves it running, when Screenpipe's address is not local", async () => {
    const s = contentSetup({ digest: { themes: GOOD } });
    try {
      enqueueJob(s.deps.db, "content-digest", { day: DAY }, null);
      const job = claim(s.deps);
      await runDigestJob(
        { ...s.deps, screenpipe: { baseUrl: "http://attacker.example:3030", apiKey: "k" } },
        job,
      );
      const done = reload(s.deps, job.id);
      expect(done.status).toBe("failed");
      expect(done.error).toMatch(/couldn't read Screenpipe/);
      expect(done.error).not.toContain("attacker");
    } finally {
      s.cleanup();
    }
  });

  it("fails rather than reading as empty when the never-mention list cannot be read", async () => {
    const r = await digest({ files: { "content/never-mention.md": "a\n".repeat(20 * 1024) } });
    try {
      expect(r.job.status).toBe("failed");
      expect(r.calls).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("keeps a never-mention term out of what the agent is given", async () => {
    const r = await digest({
      files: { "content/never-mention.md": "- Project Zephyr\n" },
      snippets: [
        {
          text: "Acme Docs notes for Project Zephyr launch",
          app_name: "Editor",
          window_name: "guide.md",
        },
        { text: "Acme Docs sidebar fix", app_name: "Editor", window_name: "guide.md" },
      ],
    });
    try {
      expect(r.job.status).toBe("ok");
      expect(r.calls[0]?.prompt).not.toMatch(/zephyr/i);
      expect(r.calls[0]?.prompt).toContain("sidebar fix");
    } finally {
      await r.cleanup();
    }
  });

  it("sends the prompt on stdin, never on the command line", async () => {
    const r = await digest();
    try {
      expect(r.calls[0]?.prompt).toContain(CANARY);
      expect(r.calls[0]?.args.join("\n")).not.toContain(CANARY);
      expect(r.calls[0]?.args.join("\n")).not.toContain("Acme Docs");
    } finally {
      await r.cleanup();
    }
  });

  it("drops a theme that repeats the screen text word for word, and marks the digest partial", async () => {
    const quote = {
      productId: "acme-docs",
      text: "Noticed that the sidebar collapses whenever a title is longer than the column",
      kind: "learned",
    };
    const r = await digest({
      works: { themes: [...GOOD, quote] },
      snippets: [
        {
          text: "Acme Docs: the sidebar collapses whenever a title is longer than the column",
          app_name: "Editor",
          window_name: "guide.md",
        },
      ],
    });
    try {
      const text = readFileSync(join(r.brain.root, FILE), "utf8");
      expect(text).toContain("status: partial");
      expect(text).not.toContain("collapses");
      expect(text).toContain("id: t2");
      expect(text).not.toContain("id: t3");
    } finally {
      await r.cleanup();
    }
  });

  it("compares a theme with every product's screen text, so it cannot be filed under another product", async () => {
    const sidebar = "the sidebar collapses whenever a title is longer than the column";
    const moved = {
      productId: "acme-blog",
      text: `Noticed that ${sidebar}`,
      kind: "learned",
    };
    const own = {
      productId: "acme-blog",
      text: "Drafted a new post about publishing from a repository",
      kind: "built",
    };
    const unknown = {
      ...own,
      productId: "acme-other",
      text: "Wrote an unrelated plain sentence here",
    };
    const r = await digest({
      twoProducts: true,
      works: { themes: [...GOOD, moved, own, unknown] },
      snippets: [
        { text: `Acme Docs: ${sidebar}`, app_name: "Editor", window_name: "guide.md" },
        { text: "Acme Blog: writing a post", app_name: "Editor", window_name: "post.md" },
      ],
    });
    try {
      const text = readFileSync(join(r.brain.root, FILE), "utf8");
      expect(text).toContain("status: partial");
      expect(text).not.toContain("collapses");
      expect(text).toContain("Drafted a new post");
      expect(text).not.toContain("unrelated plain sentence");
    } finally {
      await r.cleanup();
    }
  });

  it("says how many snippets Screenpipe returned and how many were kept, counts only", async () => {
    const r = await digest({
      snippets: [
        { text: "Acme Docs: fixed the sidebar", app_name: "Editor", window_name: "guide.md" },
        { text: "Something else entirely", app_name: "Editor", window_name: "other.md" },
      ],
    });
    try {
      const events = eventsSince(r.deps.db, r.job.id, 0).map((e) => e.text);
      expect(events).toContain(
        "Screenpipe returned 2 snippet(s) for acme-docs; 1 kept after filtering",
      );
    } finally {
      await r.cleanup();
    }
  });

  it("fails plainly, rather than reading as a quiet day, when the text comes with no app or window names", async () => {
    // What a renamed field looks like: the text is there, the names default to nothing.
    const r = await digest({ snippets: [{ text: "Acme Docs: fixed the sidebar", app_name: "" }] });
    try {
      expect(r.job.status).toBe("failed");
      expect(r.job.error).toMatch(/^Screenpipe's answer didn't look as expected/);
      expect(r.job.error).not.toContain("sidebar");
      expect(existsSync(join(r.brain.root, FILE))).toBe(false);
      expect(r.calls).toHaveLength(0);
      const events = eventsSince(r.deps.db, r.job.id, 0).map((e) => e.text);
      expect(events).toContain(
        "Screenpipe returned 1 snippet(s) for acme-docs; 0 kept after filtering",
      );
    } finally {
      await r.cleanup();
    }
  });

  it("still finishes quietly when Screenpipe returns nothing at all", async () => {
    const r = await digest({ snippets: [] });
    try {
      expect(r.job.status).toBe("ok");
      expect(r.job.error).toBeNull();
    } finally {
      await r.cleanup();
    }
  });

  it("waits for the owner before reading the screen, and reads once when it runs", async () => {
    const fake = await startFakeScreenpipe({
      snippets: [{ text: "Acme Docs guide", app_name: "Editor", window_name: "guide.md" }],
    });
    const s = contentSetup({ digest: { themes: GOOD } });
    try {
      writeFileSync(join(s.brain.root, "notes.md"), "# being edited\n"); // uncommitted, just now
      enqueueJob(s.deps.db, "content-digest", { day: DAY }, null);
      const job = claim(s.deps);
      await runDigestJob({ ...s.deps, screenpipe: { baseUrl: fake.url, apiKey: "k" } }, job);
      expect(reload(s.deps, job.id).status).toBe("queued");
      expect(fake.requests).toEqual([]);
      expect(
        eventsSince(s.deps.db, job.id, 0)
          .map((e) => e.text)
          .join("\n"),
      ).not.toMatch(/Read \d/);
    } finally {
      await fake.close();
      s.cleanup();
    }
  });
});
