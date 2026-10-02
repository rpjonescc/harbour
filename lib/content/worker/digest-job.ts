import { addDays, parseDay, zonedInstant } from "@/lib/format/zoned-time";
import { finish } from "@/lib/jobs/git-jobs";
import { addEvent, type Job } from "@/lib/jobs/queue";
import { deferWhileEditing, type RunDeps, runAgentJob } from "@/lib/jobs/run-job";
import { NeverMentionError, readNeverMention } from "./never-mention";
import { type DigestInputs, requireContent } from "./run-context";
import {
  checkHealth,
  describeFailure,
  fetchActivity,
  ScreenpipeError,
  type ScreenpipeSettings,
} from "./screenpipe/client";
import { filterSnippets } from "./screenpipe/redact";

export type DigestJobDeps = RunDeps & { screenpipe: ScreenpipeSettings | null };

const UNEXPECTED_ANSWER =
  "Screenpipe's answer didn't look as expected: its text came with no app or window names, so Harbour can't check it is safe to use. Check that Harbour and Screenpipe are on compatible versions, then try again.";

/** "1 October", for a day the owner reads about. */
function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

/** What one product's request returned and what survived the filters: counts only. */
type Report = { productId: string; received: number; kept: number };
type Gathered = { inputs: DigestInputs; reports: Report[]; unlabelled: boolean };

async function gather(
  deps: DigestJobDeps,
  settings: ScreenpipeSettings,
  day: string,
): Promise<Gathered> {
  const content = requireContent(deps);
  const window = {
    start: zonedInstant(day, 0, deps.timeZone),
    end: zonedInstant(addDays(day, 1), 0, deps.timeZone),
  };
  const neverMention = readNeverMention(content.root);
  await checkHealth(settings);
  const products: DigestInputs["products"] = [];
  const reports: Report[] = [];
  let received = 0;
  let named = 0;
  for (const product of content.products) {
    const activity = await fetchActivity(settings, window, product.terms);
    const rules = {
      excludeApps: content.excludeApps,
      terms: product.terms,
      productHost: new URL(product.url).hostname,
      neverMention,
    };
    const { kept, truncated } = filterSnippets(activity.snippets, rules);
    received += activity.snippets.length;
    named += activity.snippets.filter((s) => s.app !== "" || (s.window ?? "") !== "").length;
    reports.push({ productId: product.id, received: activity.snippets.length, kept: kept.length });
    if (kept.length > 0) products.push({ productId: product.id, snippets: kept, truncated });
  }
  // Text with no app and no window name at all is how a renamed field would look: not a quiet day.
  return { inputs: { day, window, products }, reports, unlabelled: received > 0 && named === 0 };
}

/**
 * Why gathering failed, as a plain sentence. Only a Screenpipe error carries a known kind; any
 * other error is described without its message, so nothing read from the screen can reach a record.
 */
function gatherFailure(error: unknown, day: string): string {
  if (error instanceof ScreenpipeError) return describeFailure(error.kind, dayLabel(day));
  if (error instanceof NeverMentionError) return error.message;
  return `Harbour couldn't read Screenpipe, so there is no activity digest for ${dayLabel(day)}.`;
}

/** True when the owner is still editing the brain and the job was put back; a failed check is not one. */
function waitsForOwner(deps: DigestJobDeps, job: Job): boolean {
  try {
    return deferWhileEditing(deps, job);
  } catch {
    return false; // the runner reports an unusable brain in its own words
  }
}

/**
 * The digest job: fetch and filter Screenpipe text in memory, then hand only the filtered
 * snippets to the agent through the normal runner. Raw text lives in this function's locals and
 * the agent's stdin and nowhere else (spec §9.4). A Screenpipe problem fails the job with a plain
 * sentence before any agent starts; nothing on topic finishes it with an event and no file.
 */
export async function runDigestJob(
  deps: DigestJobDeps,
  job: Job,
): Promise<{ pushed: boolean | null }> {
  const { db } = deps;
  const day = job.params.day ?? "";
  const fail = (message: string) => {
    addEvent(db, job.id, "error", message, deps.now());
    finish(db, job.id, "failed", message, deps.now());
    return { pushed: null };
  };
  try {
    parseDay(day);
  } catch {
    return fail("The digest day is not a date.");
  }
  if (!deps.content) return fail("The content machine is off. Turn it on with HARBOUR_CONTENT=on.");
  if (!deps.screenpipe) {
    return fail("Connect Screenpipe first: set HARBOUR_SCREENPIPE_API_KEY (Settings shows how).");
  }
  // Before reading the screen: a deferred job is claimed again and must not read it twice.
  if (waitsForOwner(deps, job)) return { pushed: null };
  let gathered: Gathered;
  try {
    gathered = await gather(deps, deps.screenpipe, day);
  } catch (error) {
    return fail(gatherFailure(error, day));
  }
  const { inputs, reports } = gathered;
  for (const r of reports) {
    const text = `Screenpipe returned ${r.received} snippet(s) for ${r.productId}; ${r.kept} kept after filtering`;
    addEvent(db, job.id, "status", text, deps.now());
  }
  if (gathered.unlabelled) return fail(UNEXPECTED_ANSWER);
  if (inputs.products.length === 0) {
    addEvent(
      db,
      job.id,
      "status",
      `No on-topic activity for ${dayLabel(day)}. No digest written.`,
      deps.now(),
    );
    finish(db, job.id, "ok", null, deps.now());
    return { pushed: null };
  }
  const counts = inputs.products.map((p) => `${p.snippets.length} snippet(s) for ${p.productId}`);
  addEvent(db, job.id, "status", `Read ${counts.join(", ")}`, deps.now());
  return runAgentJob({ ...deps, content: { ...deps.content, digest: inputs } }, job);
}
