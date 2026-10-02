import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { commitChanges, ownerChanges, pushBrain } from "@/lib/agents/brain-git";
import { approvedPillars } from "@/lib/agents/proposals";
import { ideaIdSchema, pieceIdSchema, productForIdea, splitPieceId } from "@/lib/content/ids";
import { contentPaths, isApprovedPath } from "@/lib/content/paths";
import { readAllIdeas, TooManyIdeaFilesError } from "@/lib/content/read/ideas";
import { readPieces } from "@/lib/content/read/pieces";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { isoDateIn } from "@/lib/format/date";
import { brainRootError, finish, recoveryBlock } from "@/lib/jobs/git-jobs";
import { CONTENT_AGENT_KINDS } from "@/lib/jobs/job-kinds";
import { addEvent, type Job, requestCancel } from "@/lib/jobs/queue";
import type { ContentProduct } from "@/lib/products/content";
import { approve, discardIdea, discardPiece } from "./decision-actions";
import { edit } from "./decision-edit";
import {
  type Change,
  type Decision,
  type DecisionContext,
  DecisionRefusal,
} from "./decision-types";
import { applyChange } from "./decision-write";

export type DecisionDeps = {
  /** HARBOUR_CONTENT is on: off stops every content job, this one included. */
  enabled: boolean;
  db: Db;
  root: string;
  quarantineRoot: string;
  now: () => Date;
  timeZone: string;
  products: readonly ContentProduct[];
};

const UNSAVED = "You have unsaved changes to this piece in your editor; Harbour saved nothing.";
const NOT_SAVED =
  "Harbour couldn't save that. Check the brain repository, then try again. Nothing was changed.";
const OFF = "Content is switched off, so Harbour saved nothing.";
const NOT_FOUND = "Harbour couldn't find that idea or piece. Reload the page and try again.";

// A decision job's params are strings (they are a jobs-table row), checked again here.
const Params = z.strictObject({
  action: z.enum(["approve", "edit", "discard"]),
  pieceId: pieceIdSchema.optional(),
  ideaId: ideaIdSchema.optional(),
  // Only the page reads this (to tie a failure to the state it was asked in).
  fromState: z.string().max(20).optional(),
  revision: z.coerce.number().int().min(1).max(100_000).optional(),
  flags: z.string().max(200).default(""),
  confirm: z.literal("1").optional(),
  body: z.string().min(1).max(25_000).optional(),
});
type Params = z.infer<typeof Params>;

function load(deps: DecisionDeps, params: Params): DecisionContext {
  const target = params.pieceId ? splitPieceId(params.pieceId) : null;
  const ideaId = params.ideaId ?? target?.ideaId ?? "";
  const product = productForIdea(deps.products, ideaId);
  if (!product) throw new DecisionRefusal(NOT_FOUND);
  let ideas: ReturnType<typeof readAllIdeas>["ideas"];
  try {
    ideas = readAllIdeas(deps.root, product.id).ideas;
  } catch (error) {
    if (error instanceof TooManyIdeaFilesError) throw new DecisionRefusal(error.message);
    throw error;
  }
  const idea = ideas.find((i) => i.id === ideaId);
  if (!idea) throw new DecisionRefusal(NOT_FOUND);
  return {
    root: deps.root,
    day: isoDateIn(deps.timeZone, deps.now()),
    product,
    idea,
    pieces: readPieces(deps.root, ideaId).pieces,
    pillars: approvedPillars(deps.db, product.id),
  };
}

/** What this decision changes; null when an earlier run of the same job already did it. */
function build(params: Params, ctx: DecisionContext): Change | null {
  if (params.action === "discard" && params.ideaId) return discardIdea(ctx);
  const platform = params.pieceId ? splitPieceId(params.pieceId)?.platform : undefined;
  const piece = ctx.pieces.find((p) => p.platform === platform);
  if (!piece) throw new DecisionRefusal(NOT_FOUND);
  const decision: Decision = {
    action: params.action,
    revision: params.revision,
    flags: params.flags,
    confirm: params.confirm,
    body: params.body,
  };
  if (params.action === "approve") return approve(ctx, piece, decision);
  return params.action === "edit" ? edit(ctx, piece, decision) : discardPiece(piece, decision);
}

/**
 * Applies one owner decision (spec §10.3). It is not an agent job: no model runs. It re-validates
 * everything against the files, refuses when the owner has unsaved edits to anything it would
 * write, writes, and commits only those paths. The web process never writes the brain. Event and
 * error text is fixed sentences and counts, never the piece's own words.
 */
export function runContentDecision(deps: DecisionDeps, job: Job): { pushed: boolean | null } {
  const { db, root } = deps;
  const fail = (message: string) => {
    addEvent(db, job.id, "error", message, deps.now());
    finish(db, job.id, "failed", message, deps.now());
    return { pushed: null };
  };
  try {
    if (!deps.enabled) return fail(OFF);
    const blocked = brainRootError(root) ?? recoveryBlock(deps.quarantineRoot);
    if (blocked) return fail(blocked);
    const parsed = Params.safeParse(job.params);
    if (!parsed.success) return fail("That request wasn't valid, so Harbour saved nothing.");
    const ctx = load(deps, parsed.data);
    const change = build(parsed.data, ctx);
    if (change === null) return settled(deps, job, parsed.data, ctx);
    const targets = [...Object.keys(change.write), ...Object.keys(change.create), ...change.remove];
    if (ownerChanges(root).some((c) => targets.includes(c.path))) return fail(UNSAVED);
    return commit(deps, job, parsed.data, change);
  } catch (error) {
    if (error instanceof DecisionRefusal) return fail(error.message);
    // Only the error's kind is logged: its message could carry a path or a piece's own words.
    console.error(`job ${job.id}: the decision crashed (${(error as Error).name})`);
    return fail(NOT_SAVED);
  }
}

/** The files a decision is about: what an interrupted run may have written without committing. */
function concerned(params: Params, ctx: DecisionContext): string[] {
  const pieces = params.pieceId
    ? ctx.pieces.filter((p) => p.platform === splitPieceId(params.pieceId ?? "")?.platform)
    : ctx.pieces;
  return [
    contentPaths.idea(ctx.product.id, ctx.idea.id),
    ...pieces.flatMap((p) => {
      const exported = p.front.exportPath;
      const path = contentPaths.piece(p.front.ideaId, p.platform);
      return exported && isApprovedPath(p.platform, exported) ? [path, exported] : [path];
    }),
  ];
}

/**
 * The decision is already in the files. If a run was cut off between writing and committing, the
 * files it wrote are still uncommitted: commit those, and only those, now.
 */
function settled(
  deps: DecisionDeps,
  job: Job,
  params: Params,
  ctx: DecisionContext,
): { pushed: boolean | null } {
  const mine = concerned(params, ctx);
  const left = ownerChanges(deps.root)
    .map((c) => c.path)
    .filter((path) => mine.includes(path));
  if (left.length === 0) {
    addEvent(deps.db, job.id, "status", "Already saved. Nothing more to do.", deps.now());
    finish(deps.db, job.id, "ok", null, deps.now());
    return { pushed: null };
  }
  const message = `content: ${params.action} ${params.pieceId ?? params.ideaId}`;
  return commit(deps, job, params, { write: {}, create: {}, remove: [], message }, left);
}

/** A discarded idea's chain steps still waiting are cancelled, so no step runs against it. */
function cancelQueuedSteps(deps: DecisionDeps, ideaId: string): void {
  const queued = deps.db
    .select({ id: jobs.id, params: jobs.params })
    .from(jobs)
    .where(and(eq(jobs.status, "queued"), inArray(jobs.kind, [...CONTENT_AGENT_KINDS])))
    .all();
  for (const row of queued.filter((j) => j.params.ideaId === ideaId)) {
    requestCancel(deps.db, row.id, deps.now());
  }
}

function commit(
  deps: DecisionDeps,
  job: Job,
  params: Params,
  change: Change,
  already?: string[],
): { pushed: boolean | null } {
  const { db, root } = deps;
  const applied = already ? { paths: already, undo: () => undefined } : applyChange(root, change);
  try {
    commitChanges(root, applied.paths, change.message);
  } catch (error) {
    applied.undo();
    console.error(`job ${job.id}: the decision's commit failed (${(error as Error).name})`);
    addEvent(db, job.id, "error", NOT_SAVED, deps.now());
    finish(db, job.id, "failed", NOT_SAVED, deps.now());
    return { pushed: null };
  }
  addEvent(db, job.id, "status", `Committed ${applied.paths.length} file(s)`, deps.now());
  const push = pushBrain(root);
  if (!push.ok) {
    addEvent(
      db,
      job.id,
      "error",
      "The decision is saved here, but it couldn't be pushed to the brain repository yet. Harbour will try again.",
      deps.now(),
    );
  }
  if (params.action === "discard" && params.ideaId) cancelQueuedSteps(deps, params.ideaId);
  finish(db, job.id, "ok", null, deps.now());
  return { pushed: push.ok };
}
