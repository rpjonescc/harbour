import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eventsSince } from "@/lib/jobs/queue";
import { DIGEST_DAY as DAY, digest, GOOD_THEMES as GOOD } from "@/tests/helpers/digest-run";

const FILE = `content/digests/${DAY}.md`;

// What the digest job tells the owner about what Screenpipe returned, and its cross-product guard.
describe("runDigestJob: what came back from Screenpipe", () => {
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
});
