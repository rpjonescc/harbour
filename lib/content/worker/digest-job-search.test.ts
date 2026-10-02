import { existsSync } from "node:fs";
import { join } from "node:path";
import { eventsSince } from "@/lib/jobs/queue";
import { DIGEST_DAY as DAY, digest } from "@/tests/helpers/digest-run";

const FILE = `content/digests/${DAY}.md`;
const searches = (r: Awaited<ReturnType<typeof digest>>) =>
  r.fake.requests.filter((q) => q.path === "/search");

// How the digest uses Screenpipe's text search (spec §18): one request per term, plain failures.
describe("runDigestJob: text search", () => {
  it("searches once per content term, one after another, for the local day", async () => {
    const r = await digest({ snippets: [], terms: ["acme docs", "sidebar", "getting started"] });
    try {
      expect(searches(r).map((q) => q.query.q)).toEqual([
        "acme docs",
        "sidebar",
        "getting started",
      ]);
      for (const q of searches(r)) {
        expect(q.query).toMatchObject({ content_type: "ocr", limit: "25", offset: "0" });
        expect(q.query.start_time).toBe("2026-09-30T23:00:00.000Z");
        expect(q.query.end_time).toBe("2026-10-01T23:00:00.000Z");
      }
    } finally {
      await r.cleanup();
    }
  });

  it("makes at most ten search requests however many terms a product has", async () => {
    const terms = Array.from({ length: 14 }, (_, i) => `term number ${i}`);
    const r = await digest({ snippets: [], terms });
    try {
      expect(searches(r)).toHaveLength(10);
    } finally {
      await r.cleanup();
    }
  });

  it("does not page through a huge claimed total", async () => {
    const r = await digest({
      snippets: [],
      hits: [{ text: "Acme Docs sidebar fixed" }],
      searchTotal: 9_999_999_999,
    });
    try {
      expect(r.job.status).toBe("ok");
      expect(searches(r)).toHaveLength(2); // the two default terms, one page each
    } finally {
      await r.cleanup();
    }
  });

  it("sends the agent excerpts, not the whole screen, and nothing from a frame with a private cue", async () => {
    const far = "faraway-marker";
    const r = await digest({
      snippets: [],
      hits: [
        {
          text: `${far} ${"lorem ".repeat(90)}Acme Docs sidebar fixed ${"lorem ".repeat(90)}${far}`,
        },
        { text: "Inbox (4) unread. Acme Docs launch plan from my manager" },
      ],
    });
    try {
      const prompt = r.calls[0]?.prompt ?? "";
      expect(prompt).toContain("Acme Docs sidebar fixed");
      expect(prompt).not.toContain(far);
      expect(prompt).not.toContain("launch plan");
    } finally {
      await r.cleanup();
    }
  });

  it("is a quiet day, not a failure, when nothing comes back from any source", async () => {
    const r = await digest({ snippets: [], hits: [], windows: [] });
    try {
      expect(r.job.status).toBe("ok");
      expect(r.calls).toHaveLength(0);
      expect(existsSync(join(r.brain.root, FILE))).toBe(false);
      const events = eventsSince(r.deps.db, r.job.id, 0).map((e) => e.text);
      expect(events.join("\n")).toMatch(/No on-topic activity/);
    } finally {
      await r.cleanup();
    }
  });

  it("is a quiet day when every hit holds a private cue", async () => {
    const r = await digest({ snippets: [], hits: [{ text: "Acme Docs password reset email" }] });
    try {
      expect(r.job.status).toBe("ok");
      expect(r.calls).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });
});

describe("runDigestJob: text search failures", () => {
  it.each([
    [{ searchMode: "forbidden" as const }, /key was refused/],
    [{ searchMode: "garbage" as const }, /wasn't in the expected shape/],
    [{ searchMode: "bad-json" as const }, /wasn't in the expected shape/],
    [{ searchMode: "huge" as const }, /too large to read safely/],
    [{ searchMode: "redirect" as const }, /send Harbour somewhere else/],
    [{ searchMode: "hang" as const, timeoutMs: 200 }, /isn't running/],
    [{ searchMode: "stall" as const, timeoutMs: 200 }, /isn't running/],
  ])(
    "fails the job in plain words for %j, with no digest and no agent",
    async (options, message) => {
      const r = await digest({ hits: [{ text: "Acme Docs sidebar" }], ...options });
      try {
        expect(r.job.status).toBe("failed");
        expect(r.job.error).toMatch(message);
        expect(r.job.error).not.toMatch(/sidebar|sp-test-key|127\.0\.0\.1/);
        expect(r.calls).toHaveLength(0);
        expect(existsSync(join(r.brain.root, FILE))).toBe(false);
      } finally {
        await r.cleanup();
      }
    },
  );

  it("fails when the third search answers with bad JSON, though the first two were read", async () => {
    const r = await digest({
      snippets: [],
      hits: [{ text: "Acme Docs sidebar fixed" }],
      terms: ["acme docs", "sidebar", "guide", "publish"],
      searchMode: "bad-json",
      searchOnly: 3,
    });
    try {
      expect(searches(r)).toHaveLength(3);
      expect(r.job.status).toBe("failed");
      expect(r.job.error).toMatch(/wasn't in the expected shape/);
      expect(r.calls).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("fails when the second search hangs, after the first was read", async () => {
    const r = await digest({
      snippets: [],
      hits: [{ text: "Acme Docs sidebar fixed" }],
      searchMode: "hang",
      searchOnly: 2,
      timeoutMs: 300,
    });
    try {
      expect(searches(r)).toHaveLength(2);
      expect(r.job.status).toBe("failed");
      expect(r.job.error).toMatch(/isn't running/);
    } finally {
      await r.cleanup();
    }
  });

  it("fails when a product's requests together take longer than its budget", async () => {
    const r = await digest({
      snippets: [],
      searchMode: "hang",
      timeoutMs: 15_000,
      productBudgetMs: 400,
    });
    try {
      expect(r.job.status).toBe("failed");
      expect(r.job.error).toMatch(/isn't running/);
    } finally {
      await r.cleanup();
    }
  });

  it("tolerates search items it cannot read, and a missing content field", async () => {
    const r = await digest({
      snippets: [],
      searchItems: [{ type: "OCR" }, null, { type: "OCR", content: { text: "Acme Docs sidebar" } }],
    });
    try {
      expect(r.job.status).toBe("ok");
      expect(r.calls[0]?.prompt).toContain("Acme Docs sidebar");
    } finally {
      await r.cleanup();
    }
  });
});
