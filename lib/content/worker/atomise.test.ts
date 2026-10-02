import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS } from "@/lib/content/ids";
import { eventsSince } from "@/lib/jobs/queue";
import {
  dir,
  events,
  FILES,
  go,
  IDEA_ID,
  piece,
  read,
  readIdea,
  six,
} from "@/tests/helpers/atomise";
import { contentSetup, PIECES } from "@/tests/helpers/content";
import { runOne } from "@/tests/helpers/run-job";

describe("the atomise job", () => {
  it("writes six drafting pieces with worker-made frontmatter, empty gate sidecars and a drafted idea", async () => {
    const r = go(six());
    try {
      const job = await r.run();
      expect(job.status).toBe("ok");
      for (const platform of PLATFORMS) {
        const { front, content } = read(r, platform);
        expect(front).toMatchObject({
          state: "drafting",
          revision: 1,
          edited: false,
          platform,
          ideaId: IDEA_ID,
        });
        expect(front.gates).toEqual({
          slop: "pending",
          humanizer: "pending",
          facts: "pending",
          platform: "pending",
        });
        expect(content).toEqual(PIECES[platform]);
        expect(
          JSON.parse(readFileSync(join(r.brain.root, `${dir}/${platform}.gates.json`), "utf8")),
        ).toEqual([]);
      }
      expect(readIdea(r).state).toBe("drafted");
      expect(r.calls[0]?.tools).toBe("Write");
      expect(r.calls[0]?.prompt).toContain("[p1] Publish docs in a short first deploy.");
      expect(events(r, job.id)).toMatch(/atomizer: SKILL\.md [0-9a-f]{12}/);
      expect(r.brain.git("log", "-1", "--format=%s").trim()).toBe(
        "agent(content-atomise): five minutes",
      );
    } finally {
      r.cleanup();
    }
  });

  it("keeps a claim's flag on the piece and keeps a long source title inside the piece's title cap", async () => {
    const files = {
      ...FILES,
      [`${dir}/source.md`]: (FILES[`${dir}/source.md`] as string).replace(
        "title: Five minutes to a first deploy",
        `title: ${"A".repeat(119)}`,
      ),
    };
    const flagged = piece("linkedin", {
      claims: [{ text: "Plans cost less.", trace: "none", flag: "pricing" }],
    });
    const r = go({ pieces: [flagged, ...PLATFORMS.slice(1).map((p) => piece(p))] }, files);
    try {
      expect((await r.run()).status).toBe("ok");
      expect(read(r, "linkedin").front.flags).toEqual(["pricing"]);
      expect(read(r, "website").front.title.length).toBeLessThanOrEqual(120);
    } finally {
      r.cleanup();
    }
  });

  it.each([
    [
      "an X thread of 7 posts",
      "x",
      { posts: Array(7).fill("a point"), hashtags: [] },
      /The X piece wasn't written: posts has too many posts/,
    ],
    [
      "50 hashtags",
      "linkedin",
      { text: "Hi.", hashtags: Array.from({ length: 50 }, (_, i) => `#tag${i}`) },
      /LinkedIn piece wasn't written/,
    ],
    [
      "a LinkedIn post over 3000 characters",
      "linkedin",
      { text: "a".repeat(3001), hashtags: [] },
      /LinkedIn piece wasn't written/,
    ],
    [
      "HTML",
      "facebook",
      { text: "<img src=x onerror=1>", hashtags: [] },
      /Facebook piece wasn't written: It contains HTML/,
    ],
    [
      "an image beacon",
      "blog",
      { ...PIECES.blog, body: `${PIECES.blog.body}\n\n![x](https://docs.example.com/p.png)` },
      /Blog post piece wasn't written/,
    ],
    [
      "a link to another host",
      "blog",
      { ...PIECES.blog, body: `${PIECES.blog.body}\n\n[x](https://attacker.example/)` },
      /another host|outside/,
    ],
    [
      "a link to another host in a social post",
      "facebook",
      { text: "See https://attacker.example/x", hashtags: [] },
      /outside/,
    ],
    [
      "an unknown key in the content",
      "website",
      { ...PIECES.website, state: "approved" },
      /not part of the format/,
    ],
    ["no content", "x", null, /it has no content/],
  ])(
    "writes %s as a Needs you stub and lets the other five carry on",
    async (_label, platform, content, reason) => {
      const r = go({
        pieces: PLATFORMS.map((p) => (p === platform ? piece(p, { content }) : piece(p))),
      });
      try {
        expect((await r.run()).status).toBe("ok");
        const stub = read(r, platform);
        expect(stub.front).toMatchObject({ state: "needs-you", claims: [], questions: [] });
        expect(stub.front.needsYou).toMatch(reason);
        expect(stub.content).toBeNull();
        const other = read(r, platform === "linkedin" ? "facebook" : "linkedin");
        expect(other.front.state).toBe("drafting");
        expect(readIdea(r).state).toBe("drafted");
      } finally {
        r.cleanup();
      }
    },
  );

  it("never puts the rejected text in a stub's reason", async () => {
    const content = { text: "<img src=CANARY-7>", hashtags: [] };
    const r = go({
      pieces: PLATFORMS.map((p) => (p === "facebook" ? piece(p, { content }) : piece(p))),
    });
    try {
      const job = await r.run();
      expect(read(r, "facebook").front.needsYou).not.toContain("CANARY-7");
      expect(events(r, job.id)).not.toContain("CANARY-7");
    } finally {
      r.cleanup();
    }
  });

  it("writes a platform the agent left out as a stub, and strips hidden characters with a note", async () => {
    const pieces = PLATFORMS.filter((p) => p !== "website").map((p) =>
      piece(
        p,
        p === "linkedin" ? { content: { ...PIECES.linkedin, text: "Hi\u200b there." } } : {},
      ),
    );
    const r = go({ pieces });
    try {
      const job = await r.run();
      expect(read(r, "website").front.needsYou).toBe(
        "This piece wasn't written. Discard this idea and write it again.",
      );
      expect((read(r, "linkedin").content as { text: string }).text).toBe("Hi there.");
      expect(events(r, job.id)).toMatch(/hidden characters/);
    } finally {
      r.cleanup();
    }
  });

  it("strips bidi overrides and zero-width characters from every field of every platform", async () => {
    const dirty = (text: string) => `${text.slice(0, 2)}\u202e\u2066${text.slice(2)}\u200d`;
    const pieces = PLATFORMS.map((p) =>
      piece(p, p === "x" ? { content: { posts: [dirty("Ship docs fast.")], hashtags: [] } } : {}),
    );
    const r = go({ pieces });
    try {
      expect((await r.run()).status).toBe("ok");
      expect((read(r, "x").content as { posts: string[] }).posts).toEqual(["Ship docs fast."]);
      expect(readFileSync(join(r.brain.root, `${dir}/x.md`), "utf8")).not.toMatch(
        /[\u200d\u202e\u2066]/,
      );
    } finally {
      r.cleanup();
    }
  });

  it("keeps the notes it was given out of the job's events and result", async () => {
    const canary = "CANARY-ATOMISE-91";
    const files = { ...FILES, "products/acme-docs/notes.md": `${canary}. Three projects.` };
    const s = contentSetup({ atomise: six() }, files, { echo: { text: canary } });
    try {
      const job = await runOne(s.deps, "content-atomise", { ideaId: IDEA_ID });
      expect(eventsSince(s.deps.db, job.id, 0).some((e) => e.text.includes(canary))).toBe(false);
      expect(JSON.stringify(job)).not.toContain(canary);
    } finally {
      s.cleanup();
    }
  });
});
