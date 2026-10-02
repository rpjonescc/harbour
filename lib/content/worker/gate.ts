import { z } from "zod";
import type { AgentSpec, SpecContext } from "@/lib/agents/specs";
import { type GateStep, gateTargets } from "@/lib/content/chain";
import { ideaIdSchema, productForIdea } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { GATE_PROMPT_VERSION, gatePrompt } from "@/lib/content/prompts/gate";
import { readVoice } from "@/lib/content/read/voice";
import { voiceInvalidMessage, voiceMissingMessage } from "@/lib/explain/content";
import { chainView } from "./chain-pieces";
import { DraftStartError, labelOf } from "./draft";
import { ownHosts } from "./draft-check";
import { gateWorkSchema, outcome } from "./gate-check";
import { pieceUpdate } from "./gate-write";
import { requireContent } from "./run-context";
import { loadSkill, SkillError, skillRecord } from "./skills";
import { parseWorkJson, workReview } from "./work-review";

const SKILL_GATES = { "no-ai-slop": 1, humanizer: 2 } as const;
// Strict: an unknown key in a queued job's params is a job this version did not make.
const paramsSchema = z.strictObject({
  ideaId: ideaIdSchema,
  gate: z.enum(["no-ai-slop", "humanizer"]),
  attempt: z.enum(["1", "2"]),
});
const CHANGED = "A piece changed while it was being checked, so Harbour saved nothing.";

/** The gate agent for no-ai-slop and humanizer; the facts gate is added in Task 13. */
export function gateSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  try {
    return buildSpec(params, context);
  } catch (error) {
    if (error instanceof DraftStartError || error instanceof SkillError) throw error;
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
  const step: GateStep = { gate, attempt: parsed.data.attempt === "1" ? 1 : 2 };
  const product = productForIdea(content.products, ideaId);
  if (!product)
    throw new DraftStartError("This idea belongs to a product that has no content settings.");
  const voice = readVoice(content.root, product.id);
  if (voice.state === "missing") throw new DraftStartError(voiceMissingMessage(product.name));
  if (voice.state === "invalid")
    throw new DraftStartError(voiceInvalidMessage(product.name, voice.reason));
  const view = chainView(content.root, ideaId);
  const wanted = new Set(gateTargets(view.chain, step).map((t) => t.platform));
  const targets = view.pieces.filter((p) => wanted.has(p.platform));
  if (targets.length === 0)
    throw new DraftStartError("There is nothing for this check to look at.");
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
    voice: voice.profile,
    previous,
    pieces: targets.map((p) => ({ platform: p.platform, content: p.content })),
  });
  // Empty on purpose: the worker adds the exact files it writes (decision 18), so the agent can
  // never write a piece or a sidecar itself.
  const allowed = { prefixes: [], exact: [] as string[] };
  const hosts = ownHosts(product.url);
  const base = {
    gate,
    order: SKILL_GATES[gate],
    attempt: step.attempt,
    jobId: context.jobId,
    instructions: skillRecord(skill),
  } as const;
  const files = (work: z.infer<typeof gateWorkSchema>, note: (text: string) => void) => {
    // The owner may have changed a piece since this run started: never write over that.
    const now = chainView(content.root, ideaId).pieces;
    for (const t of targets) {
      const same = now.find((p) => p.platform === t.platform);
      if (
        !same ||
        same.front.revision !== t.front.revision ||
        same.gates.length !== t.gates.length
      ) {
        throw new DraftStartError(CHANGED);
      }
    }
    note(
      `Skill ${skill.name}: ${skill.files.map((f) => `${f.name} ${f.sha256.slice(0, 12)}`).join(", ")}`,
    );
    const out: Record<string, string> = {};
    let errors = 0;
    let hidden = 0;
    for (const target of targets) {
      const returned = work.pieces.find((p) => p.platform === target.platform);
      if (!returned) continue;
      const made = outcome(target, returned, base, hosts);
      if (made.entry.result === "error") errors += 1;
      if (made.stripped) hidden += 1;
      Object.assign(out, pieceUpdate(target, [...target.gates, made.entry], made.content));
    }
    if (errors > 0) note(`${errors} piece(s) came back unusable and kept their old text`);
    if (hidden > 0) note(`Removed hidden characters from ${hidden} piece(s)`);
    return out;
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
