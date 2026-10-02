import { addDays, parseDay, zonedInstant } from "@/lib/format/zoned-time";
import { finish } from "@/lib/jobs/git-jobs";
import { addEvent, type Job } from "@/lib/jobs/queue";
import { deferWhileEditing, type RunDeps, runAgentJob } from "@/lib/jobs/run-job";
import { NeverMentionError, readNeverMention } from "./never-mention";
import { type DigestInputs, requireContent } from "./run-context";
import {
  checkHealth,
  describeFailure,
  ScreenpipeError,
  type ScreenpipeSettings,
} from "./screenpipe/client";
import { gatherProduct, type ProductSource } from "./screenpipe/sources";

export type DigestJobDeps = RunDeps & { screenpipe: ScreenpipeSettings | null };

/** "1 October", for a day the owner reads about. */
function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

/** What one product's requests returned and what survived the filters: counts only. */
type Report = { productId: string; source: ProductSource };
type Gathered = { inputs: DigestInputs; reports: Report[] };

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
  for (const product of content.products) {
    const rules = {
      excludeApps: content.excludeApps,
      terms: product.terms,
      productHost: product.allowedHosts[0] ?? "",
      neverMention,
    };
    const source = await gatherProduct(settings, window, product.terms, rules);
    reports.push({ productId: product.id, source });
    if (source.snippets.length > 0) {
      products.push({
        productId: product.id,
        snippets: source.snippets,
        truncated: source.truncated,
      });
    }
  }
  return { inputs: { day, window, products }, reports };
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
 * excerpts to the agent through the normal runner. Raw text lives in this function's locals and
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
  for (const { productId, source: s } of reports) {
    const text = `Screenpipe returned ${s.hits} text hit(s) and ${s.windows} window(s) for ${productId}; ${s.snippets.length} kept after filtering`;
    addEvent(db, job.id, "status", text, deps.now());
    if (s.skipped > 0) {
      const skipped = `${s.skipped} item(s) for ${productId} were too long or unreadable and were skipped`;
      addEvent(db, job.id, "status", skipped, deps.now());
    }
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
