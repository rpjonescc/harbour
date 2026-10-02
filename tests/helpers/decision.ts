import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePieceFile } from "@/lib/content/schema";
import { runContentDecision } from "@/lib/content/worker/decision-job";
import { enqueueJob } from "@/lib/jobs/queue";
import { seedPieces } from "./chain";
import { ACME, VOICE_ACME } from "./content";
import { openTestDb } from "./db";
import { makeGitBrain } from "./git-brain";
import { claim, reload } from "./run-job";

export const IDEA = "acme-docs-20261001-five-minutes";
export const PIECE_PATH = `content/pieces/${IDEA}/linkedin.md`;
export const READY = {
  state: "ready",
  gates: { slop: "pass", humanizer: "pass", facts: "pass", platform: "pass" },
};

/** A committed brain with Acme's voice and notes and every piece of one idea ready. */
export const brainFiles = (extra: Record<string, string> = {}): Record<string, string> => ({
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "Five minutes.\n",
  ...seedPieces(IDEA, READY),
  ...extra,
});

/** A git brain with a bare remote and a decision runner: each call queues, claims and runs one job. */
export function decisionSetup(files: Record<string, string> = brainFiles()) {
  const brain = makeGitBrain(files);
  const db = openTestDb();
  const deps = {
    db,
    root: brain.root,
    quarantineRoot: join(brain.remote, "..", "quarantine"),
    products: [ACME],
    now: () => new Date("2026-10-02T03:00:00Z"),
    timeZone: "Australia/Brisbane",
  };
  const decide = (params: Record<string, string>) => {
    enqueueJob(db, "content-decision", params, "owner@example.com");
    const job = claim({ db });
    runContentDecision(deps, job);
    return reload({ db }, job.id);
  };
  return { brain, db, deps, decide };
}

/** A piece file, parsed (throws with the reason when it is not valid). */
export function readPieceAt(root: string, path = PIECE_PATH) {
  const parsed = parsePieceFile(readFileSync(join(root, path), "utf8"));
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

export const approveParams = {
  action: "approve",
  pieceId: `${IDEA}.linkedin`,
  revision: "1",
  flags: "",
};
export const editParams = { action: "edit", pieceId: `${IDEA}.linkedin`, revision: "1" };
