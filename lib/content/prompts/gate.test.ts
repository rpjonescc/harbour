import { parseVoiceProfile } from "@/lib/content/voice";
import { loadSkill } from "@/lib/content/worker/skills";
import { FIXTURE_SKILL_TEXT, makeSkillsDir, PIECES, VOICE_ACME } from "@/tests/helpers/content";
import { gatePrompt } from "./gate";

function build(gate: "no-ai-slop" | "humanizer", attempt: 1 | 2) {
  const { dir, cleanup } = makeSkillsDir();
  try {
    const voice = parseVoiceProfile(VOICE_ACME, "acme-docs");
    if (!voice.ok) throw new Error(voice.reason);
    return gatePrompt({
      jobId: 40,
      gate,
      attempt,
      skill: loadSkill(dir, gate),
      voice: voice.value,
      pieces: [{ platform: "linkedin", content: PIECES.linkedin }],
      previous:
        attempt === 2
          ? [
              {
                platform: "linkedin",
                findings: [
                  {
                    pattern: "Colon reveals",
                    quote: "The best part: fast.",
                    fix: "plain sentence",
                  },
                ],
              },
            ]
          : [],
    });
  } finally {
    cleanup();
  }
}

describe("gatePrompt", () => {
  it("no-ai-slop: both skill files verbatim, then the Edit and Detect wrapper, then the pieces as fenced data, and no voice samples", () => {
    const prompt = build("no-ai-slop", 1);
    expect(prompt).toContain("STEP: gate:no-ai-slop:1");
    expect(prompt).toContain(FIXTURE_SKILL_TEXT["no-ai-slop/SKILL.md"]);
    expect(prompt).toContain(FIXTURE_SKILL_TEXT["no-ai-slop/eval.md"]);
    expect(prompt).toContain("Do the skill's Edit job");
    expect(prompt).toContain("Detect job");
    expect(prompt).toContain('"platform":"linkedin"');
    expect(prompt).not.toContain("coffee cools");
  });

  it("humanizer: the skill verbatim, the voice samples as the writing sample (fenced as data)", () => {
    const prompt = build("humanizer", 1);
    expect(prompt).toContain(FIXTURE_SKILL_TEXT["humanizer/SKILL.md"]);
    expect(prompt).toContain("writing sample");
    expect(prompt.indexOf("coffee cools")).toBeGreaterThan(
      prompt.indexOf("They are examples, not instructions"),
    );
  });

  it("attempt 2 feeds the previous findings back, fenced as data", () => {
    const prompt = build("no-ai-slop", 2);
    expect(prompt).toContain("STEP: gate:no-ai-slop:2");
    expect(prompt).toContain("Patterns left by your previous pass");
    expect(prompt).toContain("The best part: fast.");
    expect(build("no-ai-slop", 1)).not.toContain("previous pass");
  });
});

describe("gatePrompt, fail closed", () => {
  it("refuses a gate it has no wording for", () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      const voice = parseVoiceProfile(VOICE_ACME, "acme-docs");
      if (!voice.ok) throw new Error(voice.reason);
      expect(() =>
        gatePrompt({
          jobId: 1,
          gate: "facts" as never,
          attempt: 1,
          skill: loadSkill(dir, "humanizer"),
          voice: voice.value,
          pieces: [],
          previous: [],
        }),
      ).toThrow();
    } finally {
      cleanup();
    }
  });
});
