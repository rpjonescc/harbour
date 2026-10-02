import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { parseFile } from "@/lib/content/files";
import { ideaFrontmatter } from "@/lib/content/schema";
import { eventsSince } from "@/lib/jobs/queue";
import { contentSetup, digestFile, dumpDb, ideaFile, VOICE_ACME } from "@/tests/helpers/content";
import { runOne } from "@/tests/helpers/run-job";

const FILES = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "# Acme Docs\n\nSmall teams.\n",
  "content/digests/2026-09-30.md": digestFile("2026-09-30", [
    ["acme-docs", "Rewrote the getting-started guide around a short first deploy."],
  ]),
};
const IDEA = {
  title: "Five minutes to a first deploy",
  pillar: null,
  angle: "Show the shortest path from sign-up to a live page.",
  audienceQuestion: "How long does it take to publish docs?",
  why: "You rebuilt this guide this week.",
  sources: ["digest:2026-09-30#t1", "brain:products/acme-docs/notes.md"],
};
const PATH = "content/ideas/acme-docs/acme-docs-20261001-five-minutes-to-a-first-deploy.md";
const run = (
  works: Record<string, unknown>,
  files: Record<string, string> = FILES,
  options: Parameters<typeof contentSetup>[2] = {},
) => {
  const s = contentSetup(works, files, options);
  return { ...s, go: () => runOne(s.deps, "content-ideas", { productId: "acme-docs" }) };
};
const rejected = async (work: unknown, files = FILES) => {
  const r = run({ ideas: work }, files);
  try {
    const job = await r.go();
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/rejected|did not|already|not valid/i);
    expect(r.calls).toHaveLength(2);
    expect(existsSync(join(r.brain.root, "content/ideas"))).toBe(false);
  } finally {
    r.cleanup();
  }
};

describe("the ideas job", () => {
  it("writes each idea with worker-made frontmatter, from fenced inputs, with Write as the only tool", async () => {
    const r = run({ ideas: { ideas: [IDEA] } });
    try {
      const job = await r.go();
      expect(job).toMatchObject({ status: "ok" });
      const parsed = parseFile(readFileSync(join(r.brain.root, PATH), "utf8"), ideaFrontmatter);
      expect(parsed.ok && parsed.value).toMatchObject({
        state: "idea",
        createdBy: `job-${job.id}`,
        created: "2026-10-01",
        needsYou: null,
      });
      expect(r.calls[0]?.tools).toBe("Write");
      expect(r.calls[0]?.prompt).toContain("Rewrote the getting-started guide");
      expect(r.calls[0]?.prompt).toContain("Small software teams who write their own docs");
      expect(r.brain.git("log", "-1", "--format=%s").trim()).toBe(
        "agent(content-ideas): Acme Docs",
      );
      expect(existsSync(join(r.brain.root, "content/work", `${job.id}.json`))).toBe(false);
    } finally {
      r.cleanup();
    }
  });

  it.each([
    ["a source that does not exist", { ...IDEA, sources: ["digest:2026-09-30#t9"] }],
    ["a pillar that is not approved", { ...IDEA, pillar: "troubleshooting" }],
    ["markup in the title", { ...IDEA, title: "Five <b>minutes</b> to deploy" }],
    ["markdown in the angle", { ...IDEA, angle: "Show the **shortest** path." }],
    ["a link in the why", { ...IDEA, why: "See https://example.com for the guide." }],
    ["a zero-width character in the title", { ...IDEA, title: "Five\u200b minutes to deploy" }],
    ["a line break in the question", { ...IDEA, audienceQuestion: "How long\nit takes?" }],
    ["no sources", { ...IDEA, sources: [] }],
    ["a title over 90 characters", { ...IDEA, title: "a".repeat(91) }],
    ["an extra field", { ...IDEA, state: "approved" }],
  ])(
    "rejects an idea with %s, retries once, then fails with nothing written",
    async (_label, idea) => {
      await rejected({ ideas: [idea] });
    },
  );

  it("rejects an empty list, more than five ideas, and the same title twice", async () => {
    await rejected({ ideas: [] });
    await rejected({
      ideas: Array.from({ length: 6 }, (_, i) => ({ ...IDEA, title: `Idea ${i}` })),
    });
    await rejected({ ideas: [IDEA, { ...IDEA, title: "five minutes to a FIRST deploy!" }] });
  });

  it("rejects output that is not JSON, or has a stray top-level key", async () => {
    await rejected("not json at all");
    await rejected({ ideas: [IDEA], approved: true });
  });

  it("accepts an approved pillar key and writes it", async () => {
    const r = run({
      ideas: { ideas: [{ ...IDEA, pillar: "how-to", sources: ["pillar:how-to"] }] },
    });
    r.deps.content = {
      ...(r.deps.content as NonNullable<typeof r.deps.content>),
      approvedPillars: () => [{ key: "how-to", name: "How to", description: "Practical steps." }],
    };
    try {
      expect((await r.go()).status).toBe("ok");
      expect(r.calls[0]?.prompt).toContain("[pillar:how-to] How to: Practical steps.");
      expect(readFileSync(join(r.brain.root, PATH), "utf8")).toContain("pillar: how-to");
    } finally {
      r.cleanup();
    }
  });

  it("fails when every idea already exists, and never overwrites the owner's file", async () => {
    const existing = "---\ntitle: Mine\n---\nowner text\n";
    const r = run({ ideas: { ideas: [IDEA] } }, { ...FILES, [PATH]: existing });
    try {
      expect((await r.go()).status).toBe("failed");
      expect(readFileSync(join(r.brain.root, PATH), "utf8")).toBe(existing);
    } finally {
      r.cleanup();
    }
  });

  it("writes only the new ideas when some already exist, and repeats no title the owner has", async () => {
    const other = { ...IDEA, title: "Why we write docs next to code" };
    const taken = { ...IDEA, title: "A title from last month" };
    const r = run(
      { ideas: { ideas: [IDEA, other, taken] } },
      {
        ...FILES,
        [PATH]: ideaFile(),
        "content/ideas/acme-docs/acme-docs-20260901-old.md": ideaFile({
          title: "A title from last month",
          created: "2026-09-01",
        }),
      },
    );
    try {
      expect((await r.go()).status).toBe("ok");
      const written = r.brain.git("show", "--name-only", "--format=", "HEAD").trim().split("\n");
      expect(written).toEqual([
        "content/ideas/acme-docs/acme-docs-20261001-why-we-write-docs-next-to-code.md",
      ]);
    } finally {
      r.cleanup();
    }
  });

  it("stops at the backlog cap: writes only what fits under 12 waiting", async () => {
    const waiting = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [
        `content/ideas/acme-docs/acme-docs-20260901-w${i}.md`,
        ideaFile({ title: `Waiting ${i}`, created: "2026-09-01" }),
      ]),
    );
    const two = [IDEA, { ...IDEA, title: "Why we write docs next to code" }];
    const r = run({ ideas: { ideas: two } }, { ...FILES, ...waiting });
    try {
      expect((await r.go()).status).toBe("ok");
      const written = r.brain.git("show", "--name-only", "--format=", "HEAD").trim().split("\n");
      expect(written).toHaveLength(1);
    } finally {
      r.cleanup();
    }
  });

  it("fails without starting the agent at 12 waiting, in the spec's words", async () => {
    const waiting = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `content/ideas/acme-docs/acme-docs-20260901-w${i}.md`,
        ideaFile({ title: `Waiting ${i}`, created: "2026-09-01" }),
      ]),
    );
    const r = run({ ideas: { ideas: [IDEA] } }, { ...FILES, ...waiting });
    try {
      const job = await r.go();
      expect(job).toMatchObject({ status: "failed", error: "12 ideas are waiting; skipped" });
      expect(r.calls).toHaveLength(0);
    } finally {
      r.cleanup();
    }
  });

  it("says what to do when the voice profile or the notes are missing", async () => {
    for (const [missing, reason] of [
      ["content/voices/acme-docs.md", /voice profile first/],
      ["products/acme-docs/notes.md", /notes for this product first/],
    ] as const) {
      const { [missing]: _gone, ...rest } = FILES;
      const r = run({ ideas: { ideas: [IDEA] } }, rest);
      try {
        const job = await r.go();
        expect(job.status).toBe("failed");
        expect(job.error).toMatch(reason);
        expect(r.calls).toHaveLength(0);
      } finally {
        r.cleanup();
      }
    }
  });

  it("names the problem with an unusable voice profile, and with unsafe notes, without running", async () => {
    const badVoice = run(
      { ideas: { ideas: [IDEA] } },
      { ...FILES, "content/voices/acme-docs.md": "nope" },
    );
    try {
      const job = await badVoice.go();
      expect(job.error).toMatch(/voice profile can't be used: The file has no frontmatter/);
      expect(badVoice.calls).toHaveLength(0);
    } finally {
      badVoice.cleanup();
    }
    const { "products/acme-docs/notes.md": _n, ...rest } = FILES;
    const linked = run(
      { ideas: { ideas: [IDEA] } },
      { ...rest, "real.md": "# notes\n", "products/acme-docs/keep.md": "" },
    );
    try {
      symlinkSync(
        join(linked.brain.root, "real.md"),
        join(linked.brain.root, "products/acme-docs/notes.md"),
      );
      linked.brain.git("add", "-A"); // committed work is not "the owner is still editing"
      linked.brain.git("commit", "-q", "-m", "link");
      const job = await linked.go();
      expect(job.error).toMatch(/could not be read safely/);
      expect(linked.calls).toHaveLength(0);
    } finally {
      linked.cleanup();
    }
  });

  it("notes the gap when there is no digest, and still runs from the notes alone", async () => {
    const { "content/digests/2026-09-30.md": _digest, ...rest } = FILES;
    const r = run(
      { ideas: { ideas: [{ ...IDEA, sources: ["brain:products/acme-docs/notes.md"] }] } },
      rest,
    );
    try {
      expect((await r.go()).status).toBe("ok");
      expect(r.calls[0]?.prompt).toContain("No activity digest for the last 7 days");
    } finally {
      r.cleanup();
    }
  });

  it("keeps the agent's words out of the record, and fails a run that wrote another file", async () => {
    const canary = "CANARY-quartz-7731";
    const echoed = run({ ideas: { ideas: [IDEA] } }, FILES, { echo: { text: canary } });
    try {
      const job = await echoed.go();
      const record = JSON.stringify(eventsSince(echoed.db, job.id, 0)) + dumpDb(echoed.db);
      expect(record).not.toContain(canary);
    } finally {
      echoed.cleanup();
    }
    const stray = run({ ideas: { ideas: [IDEA] } }, FILES, {
      strays: { "content/ideas/acme-docs/acme-docs-20261001-sneaky.md": ideaFile() },
    });
    try {
      expect((await stray.go()).status).toBe("failed");
      expect(
        existsSync(join(stray.brain.root, "content/ideas/acme-docs/acme-docs-20261001-sneaky.md")),
      ).toBe(false);
    } finally {
      stray.cleanup();
    }
  });
});
