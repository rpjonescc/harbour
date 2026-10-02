import type { Platform } from "./ids";
import type { GateEntry, PieceFront } from "./schema";
import type { PieceState } from "./state";

export type GateStep = { gate: "no-ai-slop" | "humanizer" | "facts"; attempt: 1 | 2 };
export type ChainPiece = {
  platform: Platform;
  state: PieceState;
  hasContent: boolean;
  entries: GateEntry[];
};

const STAGES = [
  { gate: "no-ai-slop", names: ["no-ai-slop"] },
  { gate: "humanizer", names: ["humanizer"] },
  // The platform check runs inside the facts job's import, so one revision covers both.
  { gate: "facts", names: ["facts", "platform"] },
] as const;

const live = (p: ChainPiece) =>
  p.hasContent && (p.state === "drafting" || p.state === "ready" || p.state === "needs-you");
const inStage = (p: ChainPiece, names: readonly string[]) =>
  p.entries.filter((e) => names.includes(e.gate));
const bad = (e: GateEntry) => e.result === "fail" || e.result === "error";
// Revise once: a first attempt that failed and no second attempt yet.
const failedFirst = (p: ChainPiece, names: readonly string[]) =>
  inStage(p, names).some((e) => e.attempt === 1 && bad(e)) &&
  !inStage(p, names).some((e) => e.attempt === 2);

/** The next gate run for an idea's live pieces, or null when the chain is done (spec §8.1). */
export function chainNext(pieces: ChainPiece[]): GateStep | null {
  const pending = pieces.filter(live);
  if (pending.length === 0) return null;
  for (const { gate, names } of STAGES) {
    if (pending.some((p) => !inStage(p, names).some((e) => e.attempt === 1))) {
      return { gate, attempt: 1 };
    }
    if (pending.some((p) => failedFirst(p, names))) return { gate, attempt: 2 };
  }
  return null;
}

/** The pieces a gate run covers: every live piece at attempt 1, only the failed ones at attempt 2. */
export function gateTargets(pieces: ChainPiece[], step: GateStep): ChainPiece[] {
  const stage = STAGES.find((s) => s.gate === step.gate);
  // Types are erased at the job boundary: an unknown gate must never mean "every piece".
  if (!stage) throw new Error("gateTargets: not a gate");
  if (step.attempt !== 1 && step.attempt !== 2) throw new Error("gateTargets: not an attempt");
  return pieces.filter((p) => live(p) && (step.attempt === 1 || failedFirst(p, stage.names)));
}

const KEYS = {
  "no-ai-slop": "slop",
  humanizer: "humanizer",
  facts: "facts",
  platform: "platform",
} as const;

/** Each gate's latest result for a piece (`pending` when it has not run). */
export function summaries(entries: readonly GateEntry[]): PieceFront["gates"] {
  const out: PieceFront["gates"] = {
    slop: "pending",
    humanizer: "pending",
    facts: "pending",
    platform: "pending",
  };
  for (const e of [...entries].sort((a, b) => a.attempt - b.attempt)) out[KEYS[e.gate]] = e.result;
  return out;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ORDER = [
  ["no-ai-slop", "slop"],
  ["humanizer", "humanizer"],
  ["facts", "facts"],
  ["platform", "platform"],
] as const;

function problem(entries: readonly GateEntry[], gates: PieceFront["gates"]): string | null {
  for (const [gate, key] of ORDER) {
    const result = gates[key];
    const last = [...entries]
      .filter((e) => e.gate === gate)
      .sort((a, b) => b.attempt - a.attempt)[0];
    if (result === "error") return `The ${gate} check didn't finish. Try again.`;
    if (result === "pending") return `The ${gate} check has not run yet. Try again.`;
    if (result !== "fail") continue;
    const n = last?.findings.length ?? 0;
    if (gate === "facts") {
      return `${plural(n, "thing")} in this piece don't trace to your notes or the source. Check them or remove them.`;
    }
    if (gate === "platform") {
      return `This piece doesn't fit its platform yet: ${last?.findings[0]?.fix ?? "see the details"}.`;
    }
    return `The ${gate} check still found ${plural(n, "pattern")}. Edit the piece, or discard it.`;
  }
  return null;
}

/**
 * Where a piece ends up once its chain is done. Ready only when every gate passed (or was
 * revised to a pass) and nobody asked a question; otherwise Needs you, with one plain sentence.
 * A question wins over a failure: the owner has to answer it either way.
 */
export function finalPiece(
  entries: readonly GateEntry[],
  sourceQuestions: readonly string[],
): { state: "ready" | "needs-you"; needsYou: string | null; gates: PieceFront["gates"] } {
  const gates = summaries(entries);
  const question = [...sourceQuestions, ...entries.flatMap((e) => e.questions)][0];
  const needsYou = question ? `A question for you: ${question}` : problem(entries, gates);
  return { state: needsYou === null ? "ready" : "needs-you", needsYou, gates };
}
