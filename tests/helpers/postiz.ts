import { join } from "node:path";
import type { PostizChannels } from "@/lib/content/postiz/channels";
import { type PostizJobDeps, runPostizJob } from "@/lib/content/worker/postiz-job";
import { claimNextJob, enqueueJob } from "@/lib/jobs/queue";
import { seedPieces } from "./chain";
import { ACME, VOICE_ACME } from "./content";
import { openTestDb } from "./db";
import { FACEBOOK_ID, INSTAGRAM_ID, LINKEDIN_ID, POSTIZ_KEY } from "./fake-postiz";
import { makeGitBrain } from "./git-brain";
import { reload } from "./run-job";

export const IDEA = "acme-docs-20261001-five-minutes";
export const pieceId = (platform = "linkedin") => `${IDEA}.${platform}`;
export const piecePath = (platform = "linkedin") => `content/pieces/${IDEA}/${platform}.md`;
export const APPROVED = {
  state: "approved",
  gates: { slop: "pass", humanizer: "pass", facts: "pass", platform: "pass" },
  approvedAt: "2026-10-02",
};
export const CHANNELS: PostizChannels = {
  linkedin: LINKEDIN_ID,
  facebook: FACEBOOK_ID,
  instagram: INSTAGRAM_ID,
};

/** A committed brain whose idea has every piece approved (or `over`), and a send runner. */
export function postizSetup(over: Record<string, unknown> = APPROVED) {
  const brain = makeGitBrain({
    "content/voices/acme-docs.md": VOICE_ACME,
    "products/acme-docs/notes.md": "Five minutes.\n",
    ...seedPieces(IDEA, over),
  });
  const db = openTestDb();
  let at = new Date("2026-10-04T01:00:00Z");
  const deps = (url: string | null, extra: Partial<PostizJobDeps> = {}): PostizJobDeps => ({
    enabled: true,
    db,
    root: brain.root,
    quarantineRoot: join(brain.remote, "..", "quarantine"),
    products: [ACME],
    now: () => at,
    channels: CHANNELS,
    postiz: url ? { baseUrl: url, apiKey: POSTIZ_KEY, timeoutMs: 1000 } : null,
    ...extra,
  });
  /** Queues, claims and runs one send at the current time. */
  const send = async (
    url: string | null,
    params: Record<string, string>,
    extra: Partial<PostizJobDeps> = {},
  ) => {
    enqueueJob(db, "content-postiz", params, "owner@example.com", at);
    const job = claimNextJob(db, at);
    if (!job) throw new Error("expected a queued send");
    const result = await runPostizJob(deps(url, extra), job);
    return { job: reload({ db }, job.id), result };
  };
  const later = (minutes: number) => {
    at = new Date(at.getTime() + minutes * 60_000);
  };
  return { brain, db, send, later };
}
