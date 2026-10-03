import { z } from "zod";

/** How a pull request's checks stand: `none` when it has no checks at all. */
export type ChecksState = "failing" | "passing" | "pending" | "none";

/** What the sync needs to know about one pull request. */
export type PrFacts =
  | { state: "merged"; mergedAt: Date | null }
  | { state: "open"; draft: boolean; checks: ChecksState }
  | { state: "closed" };

const text = z.string().nullish();

// A check run (GitHub Actions and apps) or a commit status (older integrations).
const Check = z.object({
  __typename: text,
  status: text,
  conclusion: text,
  state: text,
});

/** `gh pr view --json …`: only the fields the rules use are checked; the rest is ignored. */
const PrView = z.object({
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  mergedAt: text,
  statusCheckRollup: z.array(Check).nullish(),
});

const FAILED = new Set(["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"]);
// A cancelled or skipped run is not a failure: re-runs and path filters cancel and skip runs.
const SETTLED_OK = new Set(["SUCCESS", "NEUTRAL", "SKIPPED", "CANCELLED", "STALE"]);

function checkOutcome(check: z.infer<typeof Check>): Exclude<ChecksState, "none"> {
  const result =
    check.__typename === "StatusContext"
      ? check.state
      : check.status === "COMPLETED"
        ? check.conclusion
        : null;
  const value = result?.toUpperCase() ?? "";
  if (FAILED.has(value)) return "failing";
  if (SETTLED_OK.has(value)) return "passing";
  return "pending";
}

/** Failing if any check failed, else pending while any runs, else passing. */
export function checksState(checks: readonly z.infer<typeof Check>[]): ChecksState {
  if (checks.length === 0) return "none";
  const outcomes = checks.map(checkOutcome);
  if (outcomes.includes("failing")) return "failing";
  if (outcomes.includes("pending")) return "pending";
  return "passing";
}

function dateOrNull(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The facts in gh's JSON answer, or null when it is not the expected shape. */
export function parsePrFacts(stdout: string): PrFacts | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return null;
  }
  const parsed = PrView.safeParse(raw);
  if (!parsed.success) return null;
  const pr = parsed.data;
  if (pr.state === "MERGED") return { state: "merged", mergedAt: dateOrNull(pr.mergedAt) };
  if (pr.state === "CLOSED") return { state: "closed" };
  return { state: "open", draft: pr.isDraft, checks: checksState(pr.statusCheckRollup ?? []) };
}
