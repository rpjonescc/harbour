import { loadSkill } from "@/lib/content/worker/skills";
import { FIXTURE_SKILL_TEXT, makeSkillsDir, PIECES } from "@/tests/helpers/content";
import { factsGatePrompt } from "./facts-gate";

const base = {
  jobId: 50,
  pieces: [
    {
      platform: "linkedin",
      content: PIECES.linkedin,
      claims: [{ text: "Quick.", trace: "source:p1" as const }],
    },
  ],
  source: [{ id: "p1", text: "Publish docs in a short first deploy." }],
  facts: "[product:acme-docs]\nAcme Docs at https://docs.example.com",
};

describe("factsGatePrompt", () => {
  it("attempt 1 lists claims, pastes no skill, and fences the pieces, the writer's claims, the source and the facts", () => {
    const prompt = factsGatePrompt({ ...base, attempt: 1, skills: [], previous: [] });
    expect(prompt).toContain("STEP: gate:facts:1");
    expect(prompt).toContain("list every factual claim");
    expect(prompt).toContain("[p1] Publish docs in a short first deploy.");
    expect(prompt).toContain("cross-check them; do not trust them");
    expect(prompt).not.toContain("Instructions: the owner's installed skill");
    expect(prompt).not.toContain("Problems found in each piece");
  });

  it("attempt 2 pastes both writing skills as constraints, feeds the findings back and forbids adding claims", () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      const prompt = factsGatePrompt({
        ...base,
        attempt: 2,
        skills: [loadSkill(dir, "no-ai-slop"), loadSkill(dir, "humanizer")],
        previous: [
          {
            platform: "linkedin",
            findings: [
              { pattern: "Number not in the source", quote: "40", fix: "Remove the number" },
            ],
          },
        ],
      });
      expect(prompt).toContain("STEP: gate:facts:2");
      expect(prompt).toContain(FIXTURE_SKILL_TEXT["no-ai-slop/SKILL.md"]);
      expect(prompt).toContain(FIXTURE_SKILL_TEXT["humanizer/SKILL.md"]);
      expect(prompt).toContain("Number not in the source");
      expect(prompt).toContain("You may not add any claim");
    } finally {
      cleanup();
    }
  });

  it("refuses an attempt it has no wording for", () => {
    expect(() =>
      factsGatePrompt({ ...base, attempt: 3 as never, skills: [], previous: [] }),
    ).toThrow();
  });
});
