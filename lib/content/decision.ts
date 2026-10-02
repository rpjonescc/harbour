import { z } from "zod";
import { finalPiece } from "./chain";
import { ideaIdSchema, type Platform, pieceIdSchema } from "./ids";
import { type Finding, FLAGS, type Flag, type GateEntry, type PieceFront } from "./schema";
import type { PieceState } from "./state";

const revision = z.number().int().min(1).max(100_000);
const flags = z.array(z.enum(FLAGS)).max(6).default([]);

/** What the owner may ask of one piece or idea; strict, so an unknown action or key is refused. */
export const DecisionBody = z.union([
  z.strictObject({
    action: z.literal("approve"),
    pieceId: pieceIdSchema,
    revision,
    checkedFlags: flags,
    confirmOpen: z.boolean().default(false),
  }),
  z.strictObject({
    action: z.literal("edit"),
    pieceId: pieceIdSchema,
    revision,
    body: z.string().min(1).max(20_000),
  }),
  z.strictObject({ action: z.literal("discard"), pieceId: pieceIdSchema, revision }),
  z.strictObject({ action: z.literal("discard"), ideaId: ideaIdSchema }),
]);
export type DecisionBody = z.infer<typeof DecisionBody>;

/** An edit may run 10% over the platform's own length (spec §10.3); the checks then say what to trim. */
export const MAX_EDIT_CHARS: Record<Platform, number> = {
  linkedin: 3300,
  x: 1700,
  instagram: 2420,
  facebook: 1650,
  blog: 13_200,
  website: 1320,
};

type Approvable = {
  state: PieceState;
  flags: readonly Flag[];
  hasContent: boolean;
  needsYou: string | null;
};

/** Why a piece cannot be approved as asked, in the words shown to the owner; null when it can. */
export function approveProblem(
  piece: Approvable,
  ask: { checkedFlags: readonly Flag[]; confirmOpen: boolean },
): string | null {
  if (piece.state !== "ready" && piece.state !== "needs-you") {
    return "This piece can't be approved now.";
  }
  if (!piece.hasContent) return "There is nothing to approve: this piece wasn't written.";
  if (piece.flags.some((flag) => !ask.checkedFlags.includes(flag))) {
    return "Tick every flag before approving.";
  }
  if (piece.state === "needs-you" && !ask.confirmOpen) {
    return `Approve anyway? ${piece.needsYou ?? "Something is still open."}`;
  }
  return null;
}

/** A fresh deterministic result, shaped like a gate entry so the one set of plain sentences is used. */
const fresh = (gate: GateEntry["gate"], order: 1 | 2 | 3 | 4, findings: Finding[]): GateEntry => ({
  gate,
  order,
  attempt: 1,
  result: findings.length > 0 ? "fail" : "pass",
  findings,
  questions: [],
  jobId: 0,
  at: "",
  textBefore: `sha256:${"0".repeat(64)}`,
  textAfter: `sha256:${"0".repeat(64)}`,
});

/**
 * The state after the owner's edit, from the fresh facts and platform checks alone (spec §10.3:
 * the skills are not re-run on the owner's own words, so an earlier slop or humanizer result
 * neither blocks nor passes it and is kept as it was). An open question still keeps it in Needs you.
 */
export function editedOutcome(
  prior: PieceFront["gates"],
  facts: Finding[],
  platform: Finding[],
  questions: readonly string[] = [],
): { state: "ready" | "needs-you"; needsYou: string | null; gates: PieceFront["gates"] } {
  // The two skill gates are stood in by passes: only the fresh checks decide the state.
  const now = [
    fresh("no-ai-slop", 1, []),
    fresh("humanizer", 2, []),
    fresh("facts", 3, facts),
    fresh("platform", 4, platform),
  ];
  const checked = finalPiece(now, questions);
  return {
    state: checked.state,
    needsYou: checked.needsYou,
    gates: {
      slop: prior.slop,
      humanizer: prior.humanizer,
      facts: checked.gates.facts,
      platform: checked.gates.platform,
    },
  };
}
