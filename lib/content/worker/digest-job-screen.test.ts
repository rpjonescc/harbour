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

  it("says how many hits and windows Screenpipe returned and how many were kept, counts only", async () => {
    const r = await digest({
      snippets: [],
      hits: [
        { text: "Acme Docs: fixed the sidebar" },
        { text: "Something else entirely" },
        { text: `Acme Docs: ${"x".repeat(20_001)}` },
      ],
      windows: [
        { app_name: "Editor", window_name: "Acme Docs guide.md", minutes: 12 },
        { app_name: "Editor", window_name: "notes.md", minutes: 5 },
        { app_name: "Chrome", window_name: "Inbox - Acme Docs", minutes: 2 },
      ],
    });
    try {
      const events = eventsSince(r.deps.db, r.job.id, 0).map((e) => e.text);
      // Two terms, so each of the three rows comes back twice (the fake does not match `q`); the oversize row is skipped.
      expect(events).toContain(
        "Screenpipe returned 6 text hit(s) and 3 window(s) for acme-docs; 2 kept after filtering",
      );
      expect(events).toContain(
        "2 item(s) for acme-docs were too long or unreadable and were skipped",
      );
      expect(events.join("\n")).not.toMatch(/sidebar|guide\.md|x{50}/);
    } finally {
      await r.cleanup();
    }
  });

  it("reads a window row as its title and minutes, with the app that held it", async () => {
    const r = await digest({
      snippets: [],
      windows: [{ app_name: "Editor", window_name: "Acme Docs - guide.md", minutes: 12.4 }],
    });
    try {
      expect(r.job.status).toBe("ok");
      expect(r.calls[0]?.prompt).toContain("Acme Docs - guide.md (12 min)");
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
