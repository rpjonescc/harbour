import { hasControlChars, hasInvisible } from "@/lib/text/hidden-chars";
import { httpUrl } from "../evidence";
import { normaliseTitle } from "../store";
import type { ActionStatus, NewAction } from "../types";
import { CliUsageError } from "./usage-error";

/** Options of `add` besides --product and --status, which `list` shares. */
export const ADD_OPTIONS = [
  "title",
  "why",
  "area",
  "impact",
  "effort",
  "fix",
  "check",
  "evidence",
  "doc",
] as const;

export type AddValues = {
  title?: string;
  why?: string;
  area?: string;
  impact?: string;
  effort?: string;
  fix?: string;
  check?: string;
  evidence?: string[];
  doc?: string[];
};

/** A validated hand-made action, before the product is looked up. */
export type AddInput = {
  productId: string;
  status: Extract<ActionStatus, "suggested" | "open" | "in_progress">;
  title: string;
  why: string;
  fix: string | null;
  check: string | null;
  area: NewAction["area"];
  impact: NewAction["impact"];
  effort: NewAction["effort"];
  evidence: string[];
  docs: string[];
};

export const MAX_ADD_EVIDENCE = 8;
export const MAX_ADD_DOCS = 8;
/** Longest an evidence line or a doc link may be (a doc link is stored as an evidence line). */
export const MAX_ADD_LINE = 300;
const TEXT_LIMITS = { title: [8, 140], why: [10, 600], fix: [1, 600], check: [1, 600] } as const;
const STATUSES = ["suggested", "open", "in_progress"] as const;

function oneOf<T extends string>(flag: string, raw: string | undefined, allowed: readonly T[]): T {
  const found = allowed.find((a) => a === raw);
  if (found) return found;
  throw new CliUsageError(`--${flag} must be one of: ${allowed.join(", ")}`);
}

/** Plain text: trimmed, no control or invisible characters, and no newline unless allowed. */
function plain(flag: string, raw: string, opts: { multiline: boolean }): string {
  const text = raw.trim();
  if (hasControlChars(text) || hasInvisible(text) || (!opts.multiline && text.includes("\n"))) {
    const what = opts.multiline
      ? "control or hidden characters"
      : "newlines, control or hidden characters";
    throw new CliUsageError(`--${flag} must be plain text without ${what}`);
  }
  return text;
}

function required(flag: keyof typeof TEXT_LIMITS, raw: string | undefined): string {
  if (raw === undefined) throw new CliUsageError(`--${flag} is required`);
  const [min, max] = TEXT_LIMITS[flag];
  const text = plain(flag, raw, { multiline: flag !== "title" });
  if (text.length < min || text.length > max) {
    throw new CliUsageError(`--${flag} must be ${min} to ${max} characters`);
  }
  return text;
}

function optional(flag: "fix" | "check", raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const [, max] = TEXT_LIMITS[flag];
  const text = plain(flag, raw, { multiline: true });
  if (text === "") throw new CliUsageError(`--${flag} must not be empty when given`);
  if (text.length > max) throw new CliUsageError(`--${flag} must be at most ${max} characters`);
  return text;
}

function lines(flag: "evidence" | "doc", raw: string[] | undefined, max: number): string[] {
  const items = (raw ?? []).map((item) => plain(flag, item, { multiline: false }));
  if (items.length > max) throw new CliUsageError(`At most ${max} --${flag} options`);
  for (const item of items) {
    if (item === "" || item.length > MAX_ADD_LINE) {
      throw new CliUsageError(`Each --${flag} must be 1 to ${MAX_ADD_LINE} characters`);
    }
  }
  return items;
}

function docs(raw: string[] | undefined): string[] {
  const items = lines("doc", raw, MAX_ADD_DOCS);
  for (const item of items) {
    if (!item.startsWith("https://") || !httpUrl.safeParse(item).success) {
      throw new CliUsageError(`--doc must be an https:// link without credentials: ${item}`);
    }
  }
  return items;
}

/** Reads and checks the options of `pnpm actions add`; throws CliUsageError for any mistake. */
export function parseAdd(values: AddValues & { product?: string; status?: string }): AddInput {
  if (values.product === undefined) throw new CliUsageError("--product is required");
  const title = required("title", values.title);
  if (normaliseTitle(title) === "") {
    throw new CliUsageError("--title must contain letters or numbers");
  }
  return {
    productId: values.product,
    status: values.status === undefined ? "open" : oneOf("status", values.status, STATUSES),
    title,
    why: required("why", values.why),
    fix: optional("fix", values.fix),
    check: optional("check", values.check),
    area: oneOf("area", values.area, ["SEO", "GEO", "AEO"] as const),
    impact: oneOf("impact", values.impact, ["high", "medium", "low"] as const),
    effort: oneOf("effort", values.effort, ["small", "medium", "large"] as const),
    evidence: lines("evidence", values.evidence, MAX_ADD_EVIDENCE),
    docs: docs(values.doc),
  };
}
