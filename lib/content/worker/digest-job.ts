import { addDays, parseDay, zonedInstant } from "@/lib/format/zoned-time";
import { finish } from "@/lib/jobs/git-jobs";
import { addEvent, type Job } from "@/lib/jobs/queue";
import { type RunDeps, runAgentJob } from "@/lib/jobs/run-job";
import { readNeverMention } from "./never-mention";
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

/** "1 October", for a day the owner reads about. */
function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

async function gather(
  deps: DigestJobDeps,
  settings: ScreenpipeSettings,
  day: string,
): Promise<DigestInputs> {
  const content = requireContent(deps);
  const window = {
    start: zonedInstant(day, 0, deps.timeZone),
    end: zonedInstant(addDays(day, 1), 0, deps.timeZone),
  };
  const neverMention = readNeverMention(content.root);
  await checkHealth(settings);
  const products: DigestInputs["products"] = [];
  for (const product of content.products) {
    const activity = await fetchActivity(settings, window, product.terms);
    const rules = {
      excludeApps: content.excludeApps,
      terms: product.terms,
      productHost: new URL(product.url).hostname,
      neverMention,
    };
    const { kept, truncated } = filterSnippets(activity.snippets, rules);
    if (kept.length > 0) products.push({ productId: product.id, snippets: kept, truncated });
  }
  return { day, window, products };
}

/**
 * Why gathering failed, as a plain sentence. Only a Screenpipe error carries a known kind; any
 * other error is described without its message, so nothing read from the screen can reach a record.
 */
function gatherFailure(error: unknown, day: string): string {
  if (error instanceof ScreenpipeError) return describeFailure(error.kind, dayLabel(day));
  return `Harbour couldn't read Screenpipe, so there is no activity digest for ${dayLabel(day)}.`;
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
  let inputs: DigestInputs;
  try {
    inputs = await gather(deps, deps.screenpipe, day);
  } catch (error) {
    return fail(gatherFailure(error, day));
  }
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
