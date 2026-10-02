import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS } from "@/lib/content/ids";
import { readPieces } from "@/lib/content/read/pieces";
import { loadSkill } from "@/lib/content/worker/skills";
import { eventsSince } from "@/lib/jobs/queue";
import { seedPieces } from "@/tests/helpers/chain";
import {
  contentSetup,
  FIXTURE_SKILL_TEXT,
  PIECES,
  pieceFile,
  VOICE_ACME,
} from "@/tests/helpers/content";
import { runOne } from "@/tests/helpers/run-job";

const IDEA_ID = "acme-docs-20261001-five-minutes";
const FILES = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "# Acme Docs\n",
  ...seedPieces(IDEA_ID),
};
const edited = (platform: keyof typeof PIECES, over: Record<string, unknown> = {}) => ({
  platform,
  content:
    platform === "linkedin" ? { ...PIECES.linkedin, text: "Edited plain text." } : PIECES[platform],
  findings: [],
  questions: [],
  ...over,
});
const allPieces = (over: Partial<Record<string, Record<string, unknown>>> = {}) => ({
  pieces: PLATFORMS.map((p) => edited(p, over[p])),
});
const go = (
  key: string,
  works: unknown,
  files: Record<string, string> = FILES,
  skills?: Record<string, string | null>,
  attempt = "1",
  gate = "no-ai-slop",
) => {
  const s = contentSetup({ [key]: works }, files, { skills });
  return { ...s, run: () => runOne(s.deps, "content-gate", { ideaId: IDEA_ID, gate, attempt }) };
};
const piece = (r: { brain: { root: string } }, platform: string) => {
  const found = readPieces(r.brain.root, IDEA_ID).pieces.find((p) => p.platform === platform);
  if (!found) throw new Error(`no ${platform} piece`);
  return found;
};

describe("gate a: no-ai-slop", () => {
  it("records a pass per piece with the skill's hash, writes the edited text, and keeps the piece drafting", async () => {
    const r = go("gate:no-ai-slop:1", allPieces());
    try {
      const job = await r.run();
      expect(job.status).toBe("ok");
      const linkedin = piece(r, "linkedin");
      expect(linkedin.content).toMatchObject({ text: "Edited plain text." });
      expect(linkedin.body).toContain("Edited plain text.");
      expect(linkedin.front).toMatchObject({
        state: "drafting",
        revision: 2,
        gates: { slop: "pass", humanizer: "pending" },
      });
      const [entry] = linkedin.gates;
      expect(entry).toMatchObject({
        gate: "no-ai-slop",
        order: 1,
        attempt: 1,
        result: "pass",
        findings: [],
        jobId: job.id,
      });
      expect(entry?.instructions).toEqual({
        name: "no-ai-slop",
        source: expect.stringContaining("no-ai-slop @ aaaaaaa"),
        sha256: loadSkill(r.deps.content?.skillsDir ?? "", "no-ai-slop").sha256,
      });
      expect(entry?.textBefore).not.toBe(entry?.textAfter);
      expect(r.calls[0]?.tools).toBe("Write");
      expect(
        eventsSince(r.deps.db, job.id, 0)
          .map((e) => e.text)
          .join("\n"),
      ).toMatch(/no-ai-slop: SKILL\.md [0-9a-f]{12}, eval\.md [0-9a-f]{12}/);
    } finally {
      r.cleanup();
    }
  });

  it("pastes the skill word for word, then the wrapper, then the pieces as fenced data", async () => {
    const r = go("gate:no-ai-slop:1", allPieces());
    try {
      await r.run();
      const prompt = r.calls[0]?.prompt ?? "";
      expect(prompt).toContain(FIXTURE_SKILL_TEXT["no-ai-slop/SKILL.md"]);
      expect(prompt).toContain(FIXTURE_SKILL_TEXT["no-ai-slop/eval.md"]);
      expect(prompt.indexOf("Do the skill's Edit job")).toBeGreaterThan(
        prompt.indexOf(FIXTURE_SKILL_TEXT["no-ai-slop/eval.md"]),
      );
    } finally {
      r.cleanup();
    }
  });

  it("records findings as a fail, clips long quotes, and leaves a Needs you stub untouched", async () => {
    const stub = pieceStub();
    const r = go(
      "gate:no-ai-slop:1",
      {
        pieces: PLATFORMS.filter((p) => p !== "website").map((p) =>
          edited(
            p,
            p === "x"
              ? {
                  findings: [
                    { pattern: "Colon reveals", quote: "q".repeat(500), fix: "plain sentence" },
                  ],
                }
              : {},
          ),
        ),
      },
      { ...FILES, ...stub },
    );
    try {
      await r.run();
      const x = piece(r, "x");
      expect(x.gates[0]).toMatchObject({ result: "fail" });
      expect(x.gates[0]?.findings[0]?.quote).toHaveLength(200);
      expect(x.front.gates.slop).toBe("fail");
      expect(piece(r, "website").gates).toEqual([]);
      expect(piece(r, "website").front).toMatchObject({ state: "needs-you", revision: 1 });
    } finally {
      r.cleanup();
    }
  });

  it("records an error for a piece whose returned text breaks its platform's shape, and keeps its old text", async () => {
    const r = go(
      "gate:no-ai-slop:1",
      allPieces({ linkedin: { content: { text: "Hi", hashtags: ["#a1", "#a2", "#a3", "#a4"] } } }),
    );
    try {
      await r.run();
      const linkedin = piece(r, "linkedin");
      expect(linkedin.gates[0]).toMatchObject({ result: "error" });
      expect(linkedin.content).toEqual(PIECES.linkedin);
      expect(piece(r, "x").gates[0]).toMatchObject({ result: "pass" });
    } finally {
      r.cleanup();
    }
  });

  it("revises only the pieces that failed, feeds their findings back, and records revised when clean", async () => {
    const failing = { ...FILES };
    const first = go(
      "gate:no-ai-slop:1",
      allPieces({
        x: {
          findings: [
            { pattern: "Colon reveals", quote: "The best part: fast.", fix: "plain sentence" },
          ],
        },
      }),
      failing,
    );
    try {
      await first.run();
      const second = contentSetup(
        { "gate:no-ai-slop:2": { pieces: [edited("x")] } },
        Object.fromEntries(
          Object.keys(failing).map((path) => [
            path,
            readFileSync(join(first.brain.root, path), "utf8"),
          ]),
        ),
      );
      try {
        const job = await runOne(second.deps, "content-gate", {
          ideaId: IDEA_ID,
          gate: "no-ai-slop",
          attempt: "2",
        });
        expect(job.status).toBe("ok");
        expect(second.calls[0]?.prompt).toContain("The best part: fast.");
        expect(second.calls[0]?.prompt).not.toContain('"platform":"linkedin"');
        const x = piece(second, "x");
        expect(x.gates.map((g) => [g.attempt, g.result])).toEqual([
          [1, "fail"],
          [2, "revised"],
        ]);
        expect(x.front.gates.slop).toBe("revised");
      } finally {
        second.cleanup();
      }
    } finally {
      first.cleanup();
    }
  });

  it.each([
    ["a missing platform", { pieces: PLATFORMS.slice(1).map((p) => edited(p)) }],
    ["an unknown key", { pieces: PLATFORMS.map((p) => ({ ...edited(p), state: "approved" })) }],
  ])("rejects %s, retries once and fails with nothing written", async (_label, works) => {
    const r = go("gate:no-ai-slop:1", works);
    try {
      const job = await r.run();
      expect(job.status).toBe("failed");
      expect(r.calls).toHaveLength(2);
      expect(piece(r, "linkedin").gates).toEqual([]);
    } finally {
      r.cleanup();
    }
  });

  it("fails plainly when the skill is not installed", async () => {
    const r = go("gate:no-ai-slop:1", allPieces(), FILES, { "no-ai-slop/SKILL.md": null });
    try {
      expect(await r.run()).toMatchObject({
        status: "failed",
        error: "The no-ai-slop skill isn't installed.",
      });
    } finally {
      r.cleanup();
    }
  });
});

describe("gate b: humanizer", () => {
  it("uses the humanizer skill with the voice samples as the writing sample, and records order 2", async () => {
    const r = go("gate:humanizer:1", allPieces(), FILES, undefined, "1", "humanizer");
    try {
      await r.run();
      const prompt = r.calls[0]?.prompt ?? "";
      expect(prompt).toContain(FIXTURE_SKILL_TEXT["humanizer/SKILL.md"]);
      expect(prompt).toContain("writing sample");
      expect(prompt).toContain("The page is live before your coffee cools");
      expect(piece(r, "linkedin").gates[0]).toMatchObject({
        gate: "humanizer",
        order: 2,
        result: "pass",
      });
      expect(piece(r, "linkedin").front.gates.humanizer).toBe("pass");
    } finally {
      r.cleanup();
    }
  });
});

/** A website piece that is a Needs you stub from atomise: no content, empty body. */
function pieceStub(): Record<string, string> {
  return {
    [`content/pieces/${IDEA_ID}/website.md`]: pieceFile(
      IDEA_ID,
      "website",
      { state: "needs-you", needsYou: "This piece wasn't written. Try again.", content: null },
      "",
    ),
  };
}
