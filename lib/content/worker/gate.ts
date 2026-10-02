import { z } from "zod";
import type { AgentSpec, SpecContext } from "@/lib/agents/specs";
import type { GateStep } from "@/lib/content/chain";
import { ideaIdSchema, type Platform } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { GATE_PROMPT_VERSION, gatePrompt } from "@/lib/content/prompts/gate";
import { DraftStartError, labelOf } from "./draft";
import { factsGateSpec } from "./facts-gate";
import { FactsPackError } from "./facts-pack";
import { gateWorkSchema, outcome } from "./gate-check";
import { gateInputs } from "./gate-inputs";
import { assertUnchanged, type PieceChange, writeUpdates } from "./gate-write";
import { requireContent } from "./run-context";
import { loadSkill, SkillError, skillRecord } from "./skills";
import { parseWorkJson, workReview } from "./work-review";

const SKILL_GATES = { "no-ai-slop": 1, humanizer: 2 } as const;
// Strict: an unknown key in a queued job's params is a job this version did not make.
const paramsSchema = z.strictObject({
  ideaId: ideaIdSchema,
  gate: z.enum(["no-ai-slop", "humanizer", "facts"]),
  attempt: z.enum(["1", "2"]),
});

/** The gate agent: no-ai-slop and humanizer here, the facts and platform gate in its own module. */
export function gateSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  try {
    return buildSpec(params, context);
  } catch (error) {
    if (
      error instanceof DraftStartError ||
      error instanceof SkillError ||
      error instanceof FactsPackError
    ) {
      throw error;
    }
    // Anything else (a disk error) says nothing about files, ids or text.
    throw new Error(
      "Harbour couldn't read what it needs to check these pieces. Check the brain folder, then try again.",
    );
  }
}

function buildSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const content = requireContent(context);
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) throw new DraftStartError("This is not a check Harbour knows.");
  const { ideaId, gate } = parsed.data;
  const attempt = parsed.data.attempt === "1" ? 1 : 2;
  if (gate === "facts") return factsGateSpec({ ideaId, attempt }, context);
  const step: GateStep = { gate, attempt };
  const { voice, view, targets, hosts, source } = gateInputs(content, ideaId, step);
  const skill = loadSkill(content.skillsDir, gate); // throws SkillError with a plain reason
  const previous =
    step.attempt === 2
      ? targets.map((p) => ({
          platform: p.platform,
          findings: p.gates
            .filter((e) => e.gate === gate && e.attempt === 1)
            .flatMap((e) => e.findings),
        }))
      : [];
  const prompt = gatePrompt({
    jobId: context.jobId,
    gate,
    attempt: step.attempt,
    skill,
    voice,
    previous,
    pieces: targets.map((p) => ({ platform: p.platform, content: p.content })),
  });
  // Empty on purpose: the worker adds the exact files it writes (decision 18), so the agent can
  // never write a piece or a sidecar itself.
  const allowed = { prefixes: [], exact: [] as string[] };
  const base = {
    gate,
    order: SKILL_GATES[gate],
    attempt: step.attempt,
    jobId: context.jobId,
    instructions: skillRecord(skill),
  } as const;
  const files = (work: z.infer<typeof gateWorkSchema>, note: (text: string) => void) => {
    assertUnchanged(content.root, ideaId, view.pieces);
    note(
      `Skill ${skill.name}: ${skill.files.map((f) => `${f.name} ${f.sha256.slice(0, 12)}`).join(", ")}`,
    );
    const changes = new Map<Platform, PieceChange>();
    let errors = 0;
    let hidden = 0;
    for (const target of targets) {
      const returned = work.pieces.find((p) => p.platform === target.platform);
      if (!returned) continue;
      const made = outcome(target, returned, base, hosts);
      if (made.entry.result === "error") errors += 1;
      if (made.stripped) hidden += 1;
      changes.set(target.platform, {
        piece: target,
        entries: [...target.gates, made.entry],
        content: made.content,
      });
    }
    if (errors > 0) note(`${errors} piece(s) came back unusable and kept their old text`);
    if (hidden > 0) note(`Removed hidden characters from ${hidden} piece(s)`);
    return writeUpdates(view, changes, source?.front.questions ?? []);
  };
  const first = targets[0];
  return {
    kind: "content-gate",
    label: `Check (${gate}): ${labelOf(ideaId)}`,
    prompt,
    allowed,
    targets: [contentPaths.work(context.jobId)],
    output: null,
    requiredFiles: [],
    requiredOutputs: first ? [contentPaths.piece(ideaId, first.platform)] : [],
    promptVersion: GATE_PROMPT_VERSION,
    tools: ["Write"],
    stdin: true,
    // The agent's own words can quote the pieces it was given: they stay out of the run record.
    quiet: true,
    quietFailure: "The check agent didn't finish.",
    review: workReview({
      jobId: context.jobId,
      prompt,
      allowed,
      plan: {
        parse: (raw) => {
          const result = parseWorkJson(raw, gateWorkSchema);
          if (!result.ok) return result;
          const sent = targets
            .map((t) => t.platform)
            .sort()
            .join(",");
          const got = result.value.pieces
            .map((p) => p.platform)
            .sort()
            .join(",");
          return sent === got
            ? result
            : { ok: false, reason: "Return exactly one entry for each piece you were given." };
        },
        files,
      },
    }),
  };
}
