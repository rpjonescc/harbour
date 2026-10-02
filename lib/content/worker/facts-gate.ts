import { z } from "zod";
import type { AgentSpec, SpecContext } from "@/lib/agents/specs";
import { type Platform, platformSchema } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { FACTS_GATE_PROMPT_VERSION, factsGatePrompt } from "@/lib/content/prompts/facts-gate";
import { claimSchema } from "@/lib/content/schema";
import { DraftStartError, labelOf, readIdeaFile } from "./draft";
import { type FactsRun, factsChange } from "./facts-gate-change";
import { buildFactsPack, factsPackText } from "./facts-pack";
import { gateInputs } from "./gate-inputs";
import { assertUnchanged, type PieceChange, writeUpdates } from "./gate-write";
import { requireContent } from "./run-context";
import { loadSkill } from "./skills";
import { parseWorkJson, workReview } from "./work-review";

const text = (max: number) => z.string().trim().min(1).max(max);
const base = {
  platform: platformSchema,
  claims: z.array(claimSchema).max(20).default([]),
  questions: z.array(text(200)).max(5).default([]),
};
// Strict: an unknown key (`state`, `approved`) rejects the whole file.
const first = z.strictObject({ pieces: z.array(z.strictObject(base)).min(1).max(6) });
const second = z.strictObject({
  pieces: z
    .array(z.strictObject({ ...base, content: z.unknown() }))
    .min(1)
    .max(6),
});

/**
 * The facts and platform gates (spec §8.3 c and d). One agent run lists every claim in every live
 * piece (attempt 1) or fixes the failed ones (attempt 2); the worker decides both results itself.
 */
export function factsGateSpec(
  input: { ideaId: string; attempt: 1 | 2 },
  context: SpecContext,
): AgentSpec {
  const content = requireContent(context);
  const { ideaId, attempt } = input;
  const { product, voice, view, targets, hosts, source } = gateInputs(content, ideaId, {
    gate: "facts",
    attempt,
  });
  if (!source) throw new DraftStartError("There is no source piece to check the pieces against.");
  const idea = readIdeaFile(content.root, contentPaths.idea(product.id, ideaId)).idea;
  const pack = buildFactsPack({
    root: content.root,
    product,
    idea,
    pillars: content.approvedPillars(product.id),
  });
  const factsText = factsPackText(pack);
  // A revision edits text that gates a and b already passed: both skills ride along as constraints.
  const skills =
    attempt === 2
      ? [loadSkill(content.skillsDir, "no-ai-slop"), loadSkill(content.skillsDir, "humanizer")]
      : [];
  const previous =
    attempt === 2
      ? targets.map((p) => ({
          platform: p.platform,
          findings: p.gates
            .filter((e) => (e.gate === "facts" || e.gate === "platform") && e.attempt === 1)
            .flatMap((e) => e.findings),
        }))
      : [];
  const prompt = factsGatePrompt({
    jobId: context.jobId,
    attempt,
    skills,
    previous,
    source: source.paragraphs,
    facts: factsText,
    pieces: targets.map((p) => ({
      platform: p.platform,
      content: p.content,
      claims: p.front.claims,
    })),
  });
  // Empty on purpose: the worker adds the exact files it writes, so the agent never writes a piece.
  const allowed = { prefixes: [], exact: [] as string[] };
  const run: FactsRun = {
    attempt,
    jobId: context.jobId,
    hosts,
    voice,
    factsText,
    sourceText: source.paragraphs.map((p) => p.text).join("\n"),
    paragraphIds: source.paragraphs.map((p) => p.id),
    factRefs: pack.map((f) => f.ref),
  };
  const files = (work: z.infer<typeof second>, note: (line: string) => void) => {
    assertUnchanged(content.root, ideaId, view.pieces);
    for (const skill of skills) {
      note(
        `Skill ${skill.name}: ${skill.files.map((f) => `${f.name} ${f.sha256.slice(0, 12)}`).join(", ")}`,
      );
    }
    const changes = new Map<Platform, PieceChange>();
    let unusable = 0;
    let hidden = 0;
    for (const target of targets) {
      const returned = work.pieces.find((p) => p.platform === target.platform);
      if (!returned) continue;
      const made = factsChange(target, returned, run);
      if (made.unusable) unusable += 1;
      if (made.stripped) hidden += 1;
      changes.set(target.platform, made.change);
    }
    if (unusable > 0) note(`${unusable} piece(s) came back unusable and kept their old text`);
    if (hidden > 0) note(`Removed hidden characters from ${hidden} piece(s)`);
    return writeUpdates(view, changes, source.front.questions);
  };
  const firstTarget = targets[0];
  return {
    kind: "content-gate",
    label: `Check (facts): ${labelOf(ideaId)}`,
    prompt,
    allowed,
    targets: [contentPaths.work(context.jobId)],
    output: null,
    requiredFiles: [],
    requiredOutputs: firstTarget ? [contentPaths.piece(ideaId, firstTarget.platform)] : [],
    promptVersion: FACTS_GATE_PROMPT_VERSION,
    tools: ["Write"],
    stdin: true,
    // The agent's own words can quote the pieces and notes it was given: they stay out of the run record.
    quiet: true,
    quietFailure: "The facts check agent didn't finish.",
    review: workReview({
      jobId: context.jobId,
      prompt,
      allowed,
      plan: {
        parse: (raw) => {
          // Attempt 1 may not return content: that schema is strict, so a stray `content` is refused.
          const parsed = parseWorkJson(raw, attempt === 1 ? first : second);
          if (!parsed.ok) return parsed;
          const sent = targets
            .map((t) => t.platform)
            .sort()
            .join(",");
          const got = parsed.value.pieces
            .map((p) => p.platform)
            .sort()
            .join(",");
          return sent === got
            ? { ok: true, value: parsed.value as z.infer<typeof second> }
            : { ok: false, reason: "Return exactly one entry for each piece you were given." };
        },
        files,
      },
    }),
  };
}
