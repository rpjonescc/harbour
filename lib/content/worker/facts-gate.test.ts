import { PLATFORMS } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { FIXTURE_SKILL_TEXT, ideaFile, PIECES, pieceFile } from "@/tests/helpers/content";
import {
  AB,
  claimsFor,
  FILES,
  factsEntry,
  GOOD,
  IDEA,
  LINKEDIN_40,
  NOTES,
  piece,
  run,
  withContent,
} from "@/tests/helpers/facts-gate";

describe("the facts and platform gate", () => {
  it("records a facts and a platform entry per piece, and, with nothing left to run, makes every piece Ready", async () => {
    const r = run("gate:facts:1", claimsFor());
    try {
      expect((await r.run()).status).toBe("ok");
      const linkedin = piece(r, "linkedin");
      expect(
        linkedin.gates.slice(2).map((g) => [g.gate, g.order, g.result, g.instructions]),
      ).toEqual([
        ["facts", 3, "pass", undefined],
        ["platform", 4, "pass", undefined],
      ]);
      expect(factsEntry(linkedin)?.claims).toEqual([GOOD]);
      expect(linkedin.front).toMatchObject({
        state: "ready",
        needsYou: null,
        revision: 2,
        flags: [],
        gates: { slop: "pass", humanizer: "pass", facts: "pass", platform: "pass" },
      });
      expect(r.calls[0]?.prompt).not.toContain(FIXTURE_SKILL_TEXT["no-ai-slop/SKILL.md"]);
    } finally {
      r.cleanup();
    }
  });

  it("fails an invented number, quoting it, and keeps every piece drafting until its revision is done", async () => {
    const r = run("gate:facts:1", claimsFor(), {
      ...FILES,
      ...withContent("linkedin", LINKEDIN_40),
    });
    try {
      await r.run();
      const linkedin = piece(r, "linkedin");
      expect(factsEntry(linkedin)).toMatchObject({
        result: "fail",
        findings: [{ pattern: "Number not in the source", quote: "40" }],
      });
      expect(linkedin.front.state).toBe("drafting");
      expect(piece(r, "x").front.state).toBe("drafting");
    } finally {
      r.cleanup();
    }
  });

  it.each([
    [
      "a claim with no trace",
      { text: "Everyone loves it.", trace: "none" },
      "Claim with no source",
    ],
    [
      "a trace to a paragraph that does not exist",
      { text: "Quick.", trace: "source:p9" },
      "Trace to a paragraph that does not exist",
    ],
    [
      "a trace to a document that does not exist",
      { text: "Loved.", trace: "brain:products/other/notes.md" },
      "Trace to a source that does not exist",
    ],
  ])("fails %s", async (_label, claim, pattern) => {
    const r = run("gate:facts:1", claimsFor({ x: { claims: [claim] } }));
    try {
      await r.run();
      expect(factsEntry(piece(r, "x"))?.findings.map((f) => f.pattern)).toContain(pattern);
      expect(factsEntry(piece(r, "linkedin"))?.result).toBe("pass");
    } finally {
      r.cleanup();
    }
  });

  it("checks numbers against what the sources say, never against a source's label", async () => {
    const files = {
      ...FILES,
      "research/2024-survey.md": "# Survey\n\nTeams like a short setup.\n",
      [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile({
        state: "drafted",
        sources: ["product:acme-docs", "brain:research/2024-survey.md"],
      }),
      ...withContent("linkedin", { ...PIECES.linkedin, text: "In 2024 teams cut setup." }),
    };
    const r = run("gate:facts:1", claimsFor(), files);
    try {
      await r.run();
      expect(factsEntry(piece(r, "linkedin"))).toMatchObject({
        result: "fail",
        findings: [{ pattern: "Number not in the source", quote: "2024" }],
      });
    } finally {
      r.cleanup();
    }
  });

  it("holds the writer's own untraced claims to the trace rule, so the piece cannot reach Ready", async () => {
    const writer = [{ text: "Used by 500 schools.", trace: "none" }];
    const files = { ...FILES, ...withContent("linkedin", PIECES.linkedin) };
    const front = pieceFile(IDEA, "linkedin", { state: "drafting", gates: AB, claims: writer });
    const r = run("gate:facts:1", claimsFor(), {
      ...files,
      [contentPaths.piece(IDEA, "linkedin")]: front,
    });
    try {
      await r.run();
      const linkedin = piece(r, "linkedin");
      expect(factsEntry(linkedin)?.findings.map((f) => f.pattern)).toContain(
        "Claim with no source",
      );
      expect(linkedin.front.state).toBe("drafting");
    } finally {
      r.cleanup();
    }
  });

  it("fails a link to another host", async () => {
    const r = run("gate:facts:1", claimsFor(), {
      ...FILES,
      ...withContent("blog", {
        ...PIECES.blog,
        body: `${PIECES.blog.body} See https://attacker.example/x`,
      }),
    });
    try {
      await r.run();
      expect(factsEntry(piece(r, "blog"))?.findings.map((f) => f.pattern)).toContain(
        "Link to another host",
      );
    } finally {
      r.cleanup();
    }
  });

  it("fails the platform gate in plain words when a piece breaks the voice profile", async () => {
    const r = run("gate:facts:1", claimsFor(), {
      ...FILES,
      ...withContent("facebook", { text: "Our seamless tool is great!", hashtags: [] }),
    });
    try {
      await r.run();
      const platform = piece(r, "facebook").gates.find((g) => g.gate === "platform");
      expect(platform?.result).toBe("fail");
      expect(platform?.findings.map((f) => f.pattern)).toEqual(
        expect.arrayContaining(["Avoided word", "Exclamation mark"]),
      );
    } finally {
      r.cleanup();
    }
  });

  it("flags a pricing claim that traces, without failing it, and the piece is still Ready", async () => {
    const files = {
      ...FILES,
      "products/acme-docs/notes.md": `${NOTES}A paid plan costs $9 a month.\n`,
      ...withContent("linkedin", { ...PIECES.linkedin, text: "A paid plan costs $9 a month." }),
    };
    const claim = {
      text: "A paid plan costs $9 a month.",
      trace: "brain:products/acme-docs/notes.md",
      flag: "pricing",
    };
    const r = run("gate:facts:1", claimsFor({ linkedin: { claims: [claim] } }), files);
    try {
      await r.run();
      expect(piece(r, "linkedin").front).toMatchObject({ state: "ready", flags: ["pricing"] });
    } finally {
      r.cleanup();
    }
  });

  it("makes a piece Needs you when a question was asked, even though every gate passed", async () => {
    const r = run(
      "gate:facts:1",
      claimsFor({ blog: { questions: ["Is the free plan still 3 projects?"] } }),
    );
    try {
      await r.run();
      expect(piece(r, "blog").front).toMatchObject({
        state: "needs-you",
        needsYou: "A question for you: Is the free plan still 3 projects?",
      });
      expect(piece(r, "x").front.state).toBe("ready");
    } finally {
      r.cleanup();
    }
  });

  it("skips a Needs you stub from atomise and leaves its sentence", async () => {
    const stub = pieceFile(
      IDEA,
      "website",
      { state: "needs-you", needsYou: "This piece wasn't written. Try again.", content: null },
      "",
    );
    const r = run(
      "gate:facts:1",
      {
        pieces: PLATFORMS.filter((p) => p !== "website").map((platform) => ({
          platform,
          claims: [GOOD],
          questions: [],
        })),
      },
      { ...FILES, [contentPaths.piece(IDEA, "website")]: stub },
    );
    try {
      expect((await r.run()).status).toBe("ok");
      expect(piece(r, "website").front).toMatchObject({
        state: "needs-you",
        revision: 1,
        needsYou: "This piece wasn't written. Try again.",
      });
      expect(piece(r, "x").front.state).toBe("ready");
    } finally {
      r.cleanup();
    }
  });

  it("stores the agent's claims and questions as plain one-line text, never as they came", async () => {
    const r = run(
      "gate:facts:1",
      claimsFor({
        x: {
          claims: [{ text: "<b>Bold</b> claim", trace: "source:p1" }],
          questions: ["See <i>this</i>"],
        },
      }),
    );
    try {
      await r.run();
      const x = piece(r, "x");
      expect(factsEntry(x)?.claims).toEqual([{ text: "(not shown)", trace: "source:p1" }]);
      expect(x.front.needsYou).toBe(
        "A question for you: The check asked something that could not be shown.",
      );
    } finally {
      r.cleanup();
    }
  });

  it("refuses a work file that adds a field or leaves a piece out, and writes nothing", async () => {
    const extra = claimsFor();
    const r = run("gate:facts:1", {
      pieces: extra.pieces.map((p) => ({ ...p, state: "ready" })),
    });
    try {
      expect((await r.run()).status).toBe("failed");
      expect(piece(r, "x").front.state).toBe("drafting");
    } finally {
      r.cleanup();
    }
    const short = run("gate:facts:1", { pieces: claimsFor().pieces.slice(1) });
    try {
      expect((await short.run()).status).toBe("failed");
    } finally {
      short.cleanup();
    }
  });
});
