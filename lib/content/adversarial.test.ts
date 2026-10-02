import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS, type Platform } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { readAllIdeas } from "@/lib/content/read/ideas";
import { primaryText, withPrimaryText } from "@/lib/content/render";
import {
  CLAIM,
  chain,
  expectNothingApproved,
  IDEA_ID,
  worksWith,
} from "@/tests/helpers/adversarial";
import { CHAIN_WORKS, PIECES } from "@/tests/helpers/content";

// Spec §13's adversarial fixtures, run through the whole chain with the real runner, so a change
// that breaks one fails here by name. Each describe is one fixture class. The classes that need
// the screen (hostile Screenpipe text, the canary) are in adversarial-screen.test.ts; limits,
// restarts and skills are in adversarial-guards.test.ts; the owner's edits and approval are in
// adversarial-owner.test.ts.

describe("an invented statistic never reaches Ready", () => {
  const INVENTED = " Cuts build time by 40% for teams.";

  it("at the source: the draft stops, no platform piece is made, and the idea says why", async () => {
    const paragraphs = CHAIN_WORKS.draft.paragraphs.map((p, i) =>
      i === 0 ? { ...p, text: `${p.text}${INVENTED}` } : p,
    );
    const r = await chain({ ...CHAIN_WORKS, draft: { ...CHAIN_WORKS.draft, paragraphs } });
    try {
      expect(r.jobs).toEqual(["draft:ok"]);
      expect(r.pieces).toEqual([]);
      const idea = readAllIdeas(r.s.brain.root, "acme-docs").ideas[0]?.front;
      expect(idea?.state).toBe("idea");
      expect(idea?.needsYou).toMatch(/isn't in your notes or activity/);
    } finally {
      r.s.cleanup();
    }
  });

  it.each(PLATFORMS)(
    "at %s: the facts check catches it, allows one revision, and ends Needs you with the other five Ready",
    async (platform) => {
      const content = withPrimaryText(
        platform,
        PIECES[platform],
        `${primaryText(platform, PIECES[platform])}${INVENTED}`,
      );
      const works = {
        ...worksWith({ [platform]: content }),
        // The revision comes back with the number still in it.
        "gate:facts:2": { pieces: [{ platform, content, claims: [CLAIM], questions: [] }] },
      };
      const r = await chain(works);
      try {
        expect(r.jobs.length).toBeLessThanOrEqual(8);
        expect(r.jobs.at(-1)).toBe("gate:facts:2:ok");
        expect(r.piece(platform).front.state).toBe("needs-you");
        expect(r.piece(platform).front.needsYou).toMatch(/don't trace to your notes/);
        expect(r.pieces.filter((p) => p.front.state === "ready")).toHaveLength(5);
        expectNothingApproved(r);
      } finally {
        r.s.cleanup();
      }
    },
  );
});

describe("a claim from nowhere", () => {
  it.each([
    [
      "traced to a document that does not exist",
      { text: "Loved by teams.", trace: "brain:products/other/notes.md" },
    ],
    ["with no trace at all", { text: "Everyone loves it.", trace: "none" }],
    ["traced to a paragraph that does not exist", { text: "Quick.", trace: "source:p99" }],
  ])("%s fails the facts check and never becomes Ready", async (_label, bad) => {
    const facts = (platforms: readonly Platform[]) => ({
      pieces: platforms.map((platform) => ({
        platform,
        ...(platforms.length === 1 ? { content: PIECES[platform] } : {}),
        claims: [platform === "x" ? bad : CLAIM],
        questions: [],
      })),
    });
    const r = await chain({
      ...CHAIN_WORKS,
      "gate:facts:1": facts(PLATFORMS),
      "gate:facts:2": facts(["x"]),
    });
    try {
      expect(r.piece("x").front.state).toBe("needs-you");
      expect(r.pieces.filter((p) => p.front.state === "ready")).toHaveLength(5);
      expectNothingApproved(r);
    } finally {
      r.s.cleanup();
    }
  });
});

describe("hostile atomise output", () => {
  const manyTags = Array.from(
    { length: 50 },
    (_, i) =>
      `#tag${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
  );

  it.each([
    [
      "HTML and a script tag",
      "linkedin",
      { text: "Hi <b>there</b> <script>x</script>", hashtags: [] },
    ],
    [
      "a markdown image beacon",
      "linkedin",
      { text: "Hi ![x](https://evil.example/p.png)", hashtags: [] },
    ],
    [
      "a link to another host",
      "blog",
      { ...PIECES.blog, body: `${PIECES.blog.body} [x](https://attacker.example/)` },
    ],
    ["50 hashtags", "instagram", { ...PIECES.instagram, hashtags: manyTags }],
  ] as const)(
    "%s: that piece is a Needs you stub with the reason, and the other five are checked as usual",
    async (_label, platform, content) => {
      const gated = PLATFORMS.filter((p) => p !== platform);
      const r = await chain(worksWith({ [platform]: content }, gated));
      try {
        expect(r.piece(platform).content).toBeNull();
        expect(r.piece(platform).front.state).toBe("needs-you");
        expect(r.piece(platform).front.needsYou).toMatch(/wasn't written/);
        expect(r.pieces.filter((p) => p.front.state === "ready")).toHaveLength(5);
        expectNothingApproved(r);
      } finally {
        r.s.cleanup();
      }
    },
  );

  it("zero-width and bidi characters are stripped before anything is stored", async () => {
    const r = await chain(
      worksWith({ linkedin: { text: "Docs\u200b that\u202e ship.", hashtags: [] } }),
    );
    try {
      const stored = readFileSync(
        join(r.s.brain.root, contentPaths.piece(IDEA_ID, "linkedin")),
        "utf8",
      );
      expect(stored).not.toMatch(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/);
      expect(stored).toContain("Docs that ship.");
    } finally {
      r.s.cleanup();
    }
  });

  it.each([
    [
      "an extra platform",
      {
        pieces: [
          ...CHAIN_WORKS.atomise.pieces,
          { ...CHAIN_WORKS.atomise.pieces[0], platform: "tiktok" },
        ],
      },
    ],
    [
      "a smuggled state: approved",
      { pieces: CHAIN_WORKS.atomise.pieces.map((p) => ({ ...p, state: "approved" })) },
    ],
    ["a smuggled top-level key", { ...CHAIN_WORKS.atomise, approved: true }],
  ])("%s rejects the whole answer, retried once, and no piece exists", async (_label, atomise) => {
    const r = await chain({ ...CHAIN_WORKS, atomise });
    try {
      expect(r.jobs).toEqual(["draft:ok", "atomise:failed"]);
      expect(r.pieces).toEqual([]);
      expect(r.s.calls.filter((c) => c.prompt.includes("STEP: atomise"))).toHaveLength(2);
    } finally {
      r.s.cleanup();
    }
  });

  it("a 2 MiB work file is too large, and no piece exists", async () => {
    const r = await chain(CHAIN_WORKS, (c) => {
      const run = c.deps.run;
      c.deps.run = async (o) => {
        const out = await run(o);
        if (!o.stdin?.includes("STEP: atomise")) return out;
        const dir = join(c.brain.root, "content/work");
        for (const name of readdirSync(dir))
          writeFileSync(join(dir, name), "x".repeat(2 * 1024 * 1024));
        return out;
      };
    });
    try {
      expect(r.jobs).toEqual(["draft:ok", "atomise:failed"]);
      expect(r.pieces).toEqual([]);
    } finally {
      r.s.cleanup();
    }
  });
});

describe("hostile gate output", () => {
  const gate = (text: string) => ({
    pieces: CHAIN_WORKS["gate:humanizer:1"].pieces.map((p) =>
      p.platform === "linkedin" ? { ...p, content: { text, hashtags: ["#docs"] } } : p,
    ),
  });

  it.each([
    ["an invented number", "Docs that ship in five minutes. Over 300 teams agree."],
    [
      "a link to the product's own site",
      "Docs that ship in five minutes. https://docs.example.com/new",
    ],
    ["a link to another host", "Docs that ship in five minutes. https://evil.example/x"],
    ["a hashtag", "Docs that ship in five minutes. #winning"],
    ["an @handle", "Docs that ship in five minutes. Thanks @someone"],
    ["markup", "Docs that ship in five minutes. <img src=x>"],
  ])(
    "%s is refused twice: the old text stays and the piece needs the owner",
    async (_label, text) => {
      const hostile = gate(text);
      const r = await chain({
        ...CHAIN_WORKS,
        "gate:humanizer:1": hostile,
        "gate:humanizer:2": { pieces: hostile.pieces.filter((p) => p.platform === "linkedin") },
      });
      try {
        const linkedin = r.piece("linkedin");
        expect(linkedin.content).toEqual(PIECES.linkedin);
        expect(linkedin.gates.filter((g) => g.gate === "humanizer").map((g) => g.result)).toEqual([
          "error",
          "error",
        ]);
        expect(linkedin.front.state).not.toBe("ready");
        expectNothingApproved(r);
      } finally {
        r.s.cleanup();
      }
    },
  );

  it("hidden characters in a gate's rewrite are stripped, and the rewrite is otherwise used", async () => {
    const r = await chain({
      ...CHAIN_WORKS,
      "gate:humanizer:1": gate("Docs\u200b that ship in five minutes."),
    });
    try {
      expect(r.piece("linkedin").content).toEqual({
        text: "Docs that ship in five minutes.",
        hashtags: ["#docs"],
      });
    } finally {
      r.s.cleanup();
    }
  });
});
