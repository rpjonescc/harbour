import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { FIXTURE_SKILL_TEXT, PIECES } from "@/tests/helpers/content";
import {
  claimsFor,
  FILES,
  factsEntry,
  GOOD,
  IDEA,
  LINKEDIN_40,
  piece,
  run,
  withContent,
} from "@/tests/helpers/facts-gate";

describe("the revision (attempt 2)", () => {
  const PATHS = PLATFORMS.flatMap((p) => [
    contentPaths.piece(IDEA, p),
    contentPaths.gates(IDEA, p),
  ]);
  /** Runs attempt 1 with a failing LinkedIn piece, then returns a second run over the files it wrote. */
  async function revise(works: unknown) {
    const first = run("gate:facts:1", claimsFor(), {
      ...FILES,
      ...withContent("linkedin", LINKEDIN_40),
    });
    await first.run();
    const written = {
      ...FILES,
      ...Object.fromEntries(
        PATHS.map((path) => [path, readFileSync(join(first.brain.root, path), "utf8")]),
      ),
    };
    first.cleanup();
    return run("gate:facts:2", works, written, "2");
  }
  const fixed = {
    platform: "linkedin",
    content: { ...PIECES.linkedin, text: "Cuts build time for teams." },
    claims: [GOOD],
    questions: [],
  };

  it("sends only the failed piece, both skills as constraints and the findings; a clean result is revised and the piece is Ready", async () => {
    const r = await revise({ pieces: [fixed] });
    try {
      const job = await r.run();
      expect(job.status).toBe("ok");
      const prompt = r.calls[0]?.prompt ?? "";
      expect(prompt).toContain(FIXTURE_SKILL_TEXT["no-ai-slop/SKILL.md"]);
      expect(prompt).toContain(FIXTURE_SKILL_TEXT["humanizer/SKILL.md"]);
      expect(prompt).toContain("Number not in the source");
      expect(prompt).not.toContain('"platform":"x"');
      const linkedin = piece(r, "linkedin");
      expect(factsEntry(linkedin, 2)).toMatchObject({
        result: "revised",
        revisedAfter: ["no-ai-slop", "humanizer"],
      });
      expect(linkedin.content).toMatchObject({ text: "Cuts build time for teams." });
      expect(linkedin.front).toMatchObject({ state: "ready", gates: { facts: "revised" } });
      expect(piece(r, "x").front.state).toBe("ready");
    } finally {
      r.cleanup();
    }
  });

  it("ends Needs you, with the facts sentence, when the revision still fails", async () => {
    const r = await revise({ pieces: [{ ...fixed, content: LINKEDIN_40 }] });
    try {
      await r.run();
      expect(piece(r, "linkedin").front).toMatchObject({
        state: "needs-you",
        gates: { facts: "fail" },
      });
      expect(piece(r, "linkedin").front.needsYou).toMatch(
        /don't trace to your notes or the source/,
      );
    } finally {
      r.cleanup();
    }
  });

  it("records an error, keeps the old text and ends Needs you when the revised piece breaks its platform's shape", async () => {
    const r = await revise({
      pieces: [{ ...fixed, content: { text: "Hi", hashtags: ["#a1", "#a2", "#a3", "#a4"] } }],
    });
    try {
      await r.run();
      const linkedin = piece(r, "linkedin");
      expect(factsEntry(linkedin, 2)?.result).toBe("error");
      expect(linkedin.content).toMatchObject({ text: "Cuts build time by 40% for teams." });
      expect(linkedin.front).toMatchObject({
        state: "needs-you",
        needsYou: "The facts check couldn't use the revised piece. Edit the piece, or discard it.",
      });
    } finally {
      r.cleanup();
    }
  });

  it("does not pass a revision that changed nothing: the first findings stand", async () => {
    const r = await revise({ pieces: [{ ...fixed, content: LINKEDIN_40 }] });
    try {
      await r.run();
      const second = factsEntry(piece(r, "linkedin"), 2);
      expect(second).toMatchObject({ result: "fail" });
      expect(second?.findings.map((f) => f.pattern)).toContain("Number not in the source");
    } finally {
      r.cleanup();
    }
  });

  it("holds a revision to the wording-only rule: a number or link it adds is an error, the old text kept", async () => {
    for (const text of [
      "Cuts build time by 41% for teams.",
      "Cuts build time, see https://docs.example.com/x",
    ]) {
      const r = await revise({ pieces: [{ ...fixed, content: { ...PIECES.linkedin, text } }] });
      try {
        await r.run();
        const linkedin = piece(r, "linkedin");
        expect(factsEntry(linkedin, 2)?.result).toBe("error");
        expect(linkedin.content).toMatchObject({ text: "Cuts build time by 40% for teams." });
      } finally {
        r.cleanup();
      }
    }
  });
});
