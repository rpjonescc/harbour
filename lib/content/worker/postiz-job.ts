import { z } from "zod";
import { ownerChanges } from "@/lib/agents/brain-git";
import { PLATFORM_NAMES, pieceIdSchema, productForIdea, splitPieceId } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import {
  CHANNEL_KINDS,
  isPostizPlatform,
  type PostizChannels,
  type PostizPlatform,
} from "@/lib/content/postiz/channels";
import { NOT_ASKED, SENDS_PER_HOUR, sendsInLastHour } from "@/lib/content/postiz/limits";
import { postText } from "@/lib/content/postiz/text";
import { type ReadPiece, readPieces } from "@/lib/content/read/pieces";
import {
  CHANNEL_PROBLEMS,
  NOT_PUSHED,
  notRecorded,
  POSTIZ_REFUSALS,
  postizFailure,
  SEND_CRASHED,
} from "@/lib/explain/postiz";
import { brainRootError, finish, recoveryBlock } from "@/lib/jobs/git-jobs";
import { addEvent, type Job } from "@/lib/jobs/queue";
import type { ContentProduct } from "@/lib/products/content";
import { type CommitDeps, commitChange } from "./commit-change";
import { bumped, fileText } from "./decision-actions";
import { createDraft, listChannels, PostizError, type PostizSettings } from "./postiz/client";

export type PostizJobDeps = CommitDeps & {
  /** HARBOUR_CONTENT is on. */
  enabled: boolean;
  quarantineRoot: string;
  products: readonly ContentProduct[];
  channels: PostizChannels;
  /** Null when Postiz is not configured. */
  postiz: PostizSettings | null;
};

/** A stop in the owner's words; the job fails with exactly this sentence. */
class Stop extends Error {}

const Params = z.strictObject({
  pieceId: pieceIdSchema,
  revision: z.coerce.number().int().min(1).max(100_000),
  resend: z.literal("1").optional(),
});
type Params = z.infer<typeof Params>;

type Target = { piece: ReadPiece; platform: PostizPlatform; channelId: string; path: string };

/** The approved piece this send is about, checked against the file as it is now. */
function target(deps: PostizJobDeps, params: Params): Target {
  const split = splitPieceId(params.pieceId);
  const product = split && productForIdea(deps.products, split.ideaId);
  const piece =
    split && product
      ? readPieces(deps.root, split.ideaId).pieces.find((p) => p.platform === split.platform)
      : undefined;
  if (!split || !piece) throw new Stop(POSTIZ_REFUSALS.notFound);
  if (piece.front.revision !== params.revision) throw new Stop(POSTIZ_REFUSALS.stale);
  if (piece.front.state !== "approved" || piece.content === null) {
    throw new Stop(POSTIZ_REFUSALS.notApproved);
  }
  const platform = split.platform;
  if (!isPostizPlatform(platform)) throw new Stop(POSTIZ_REFUSALS.notSupported);
  const channelId = deps.channels[platform];
  if (!channelId) throw new Stop(POSTIZ_REFUSALS.noChannel(PLATFORM_NAMES[platform]));
  if (piece.front.postiz !== null && params.resend !== "1") {
    throw new Stop(POSTIZ_REFUSALS.alreadySent);
  }
  return { piece, platform, channelId, path: contentPaths.piece(split.ideaId, platform) };
}

/** Finds the owner's channel in Postiz's list and checks it can take this platform's piece. */
async function checkedChannel(settings: PostizSettings, t: Target): Promise<string> {
  const name = PLATFORM_NAMES[t.platform];
  const channel = (await listChannels(settings)).find((c) => c.id === t.channelId);
  if (!channel) throw new Stop(CHANNEL_PROBLEMS.missing(name));
  if (channel.disabled) throw new Stop(CHANNEL_PROBLEMS.disabled(name));
  if (!CHANNEL_KINDS[t.platform].includes(channel.kind)) {
    throw new Stop(CHANNEL_PROBLEMS.wrongKind(name));
  }
  return channel.kind;
}

/**
 * Sends one approved piece to Postiz as a draft (spec §11), then notes `postiz: { sentAt, postId }`
 * on the piece and commits only that file. No model runs. Every check that needs no network comes
 * first; a failure leaves the piece approved and says what happened in one plain sentence. The key
 * is never in an event, an error or a log line.
 */
export async function runPostizJob(
  deps: PostizJobDeps,
  job: Job,
): Promise<{ pushed: boolean | null }> {
  let stage: "checks" | "channels" | "draft" = "checks";
  const fail = (message: string) => {
    addEvent(deps.db, job.id, "error", message, deps.now());
    // A send that stopped before asking Postiz anything does not count against the hourly cap.
    finish(deps.db, job.id, "failed", message, deps.now(), stage === "checks" ? NOT_ASKED : null);
    return { pushed: null };
  };
  try {
    const { settings, t } = preflight(deps, job);
    stage = "channels";
    const kind = await checkedChannel(settings, t);
    stage = "draft";
    // Safe: preflight() refused a piece without content.
    const text = postText(t.platform, t.piece.content as NonNullable<ReadPiece["content"]>);
    const draft = { channelId: t.channelId, kind, text, date: deps.now() };
    const postId = await createDraft(settings, draft);
    addEvent(deps.db, job.id, "status", `Postiz saved the draft (post ${postId}).`, deps.now());
    try {
      return record(deps, job, t, postId);
    } catch (error) {
      console.error(`job ${job.id}: noting the Postiz draft crashed (${(error as Error).name})`);
      return fail(notRecorded(postId));
    }
  } catch (error) {
    if (error instanceof Stop) return fail(error.message);
    if (error instanceof PostizError && stage !== "checks") {
      return fail(postizFailure(error.kind, stage));
    }
    // Only the error's kind is logged: its message could carry a path or the piece's words.
    console.error(`job ${job.id}: the Postiz send crashed (${(error as Error).name})`);
    return fail(SEND_CRASHED);
  }
}

/** Every check that needs no network: switched on, connected, the brain usable, the piece, the cap. */
function preflight(deps: PostizJobDeps, job: Job): { settings: PostizSettings; t: Target } {
  if (!deps.enabled) throw new Stop(POSTIZ_REFUSALS.off);
  const settings = deps.postiz;
  if (!settings) throw new Stop(POSTIZ_REFUSALS.notConnected);
  const blocked = brainRootError(deps.root) ?? recoveryBlock(deps.quarantineRoot);
  if (blocked) throw new Stop(blocked);
  const parsed = Params.safeParse(job.params);
  if (!parsed.success) throw new Stop(POSTIZ_REFUSALS.notFound);
  const t = target(deps, parsed.data);
  if (sendsInLastHour(deps.db, deps.now(), job.id) >= SENDS_PER_HOUR) {
    throw new Stop(POSTIZ_REFUSALS.rate);
  }
  if (ownerChanges(deps.root).some((c) => c.path === t.path)) {
    throw new Stop(POSTIZ_REFUSALS.unsaved);
  }
  return { settings, t };
}

/** Notes the draft on the piece (a worker write: the revision moves on) and commits that file. */
function record(
  deps: PostizJobDeps,
  job: Job,
  t: Target,
  postId: string,
): { pushed: boolean | null } {
  const front = bumped(t.piece, { postiz: { sentAt: deps.now().toISOString(), postId } });
  const change = {
    write: { [t.path]: fileText(front, t.piece.content) },
    create: {},
    remove: [],
    message: `content: postiz draft ${t.piece.front.ideaId}.${t.platform}`,
  };
  const words = { notSaved: notRecorded(postId), notPushed: NOT_PUSHED };
  const done = commitChange(deps, job, change, words);
  if (!done.ok) return { pushed: null };
  finish(deps.db, job.id, "ok", null, deps.now());
  return { pushed: done.pushed };
}
