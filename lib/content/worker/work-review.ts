import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { z } from "zod";
import type { AllowedPaths } from "@/lib/agents/brain-git";
import { retryPrompt } from "@/lib/agents/retry-prompt";
import type { SpecReview } from "@/lib/agents/specs";
import { describeIssues } from "@/lib/content/files";
import { contentPaths } from "@/lib/content/paths";
import { readBoundedBytes } from "@/lib/note/bounded-read";

export const MAX_WORK_BYTES = 256 * 1024;

type Parse<T> = { ok: true; value: T } | { ok: false; reason: string };

/** What a step does with its validated output: parse the agent's file, and the files to write. */
export type WorkPlan<Out> = {
  parse: (text: string) => Parse<Out>;
  /** Every canonical file the worker writes for `value`, path to content. Pure. */
  files: (value: Out, note: (text: string) => void) => Record<string, string>;
  /**
   * Every planned file is a new one: created exclusively, so a file that appears between the
   * plan and the write is never overwritten. The failure is this fixed sentence.
   */
  createOnly?: { inTheWay: string };
};

/** Parses a work file's text as strict JSON; the reason never repeats the agent's own values. */
export function parseWorkJson<T>(text: string, schema: z.ZodType<T>): Parse<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, reason: "The work file is not valid JSON." };
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, reason: `The work file is not valid: ${describeIssues(result.error)}.` };
}

/** A planned path must stay inside the brain: relative, with no `..` or empty segment. */
function isInsideBrain(path: string): boolean {
  if (path === "" || path.includes("\0") || path.includes("\\")) return false;
  return !path.startsWith("/") && path.split("/").every((s) => s !== "" && s !== "..");
}

const digestOf = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

type Read = { reason: string } | { bytes: Buffer };

/** The work file's bytes, or a reason the agent can fix; any other read error is propagated. */
function readWork(root: string, rel: string): Read {
  try {
    const bytes = readBoundedBytes(join(root, rel), MAX_WORK_BYTES);
    return bytes === null
      ? { reason: "The work file is too large or is not a regular file." }
      : { bytes };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { reason: "The work file was not written." };
    }
    throw error;
  }
}

/**
 * The review of a content run (see `SpecReview`). The agent writes one work file; `check`
 * validates it with the step's plan; `publish` has the worker write every canonical file from the
 * validated value (an agent can never write frontmatter, state or gate results), appends those
 * paths to `allowed.exact` so the git gate admits exactly them, and removes the work file.
 */
export function workReview<Out>(input: {
  jobId: number;
  prompt: string;
  plan: WorkPlan<Out>;
  allowed: AllowedPaths;
}): SpecReview {
  const rel = contentPaths.work(input.jobId);
  let checked: { value: Out; digest: string } | null = null;
  return {
    check: (root) => {
      checked = null;
      const got = readWork(root, rel);
      if ("reason" in got) return got.reason;
      const parsed = input.plan.parse(got.bytes.toString("utf8"));
      if (!parsed.ok) return parsed.reason;
      checked = { value: parsed.value, digest: digestOf(got.bytes) };
      return null;
    },
    // Claude Code's Write will not overwrite a file it has not Read, and these runs have no Read.
    reset: (root) => rmSync(join(root, rel), { force: true }),
    publish: (root, note) => {
      if (checked === null) throw new Error("The work file has not been checked and accepted");
      const again = readWork(root, rel);
      if ("reason" in again || digestOf(again.bytes) !== checked.digest) {
        throw new Error("The work file changed after it was checked");
      }
      const files = input.plan.files(checked.value, note);
      const outside = Object.keys(files).find((path) => !isInsideBrain(path));
      if (outside !== undefined) throw new Error("A planned file path is outside the brain");
      for (const path of Object.keys(files)) {
        if (!input.allowed.exact.includes(path)) input.allowed.exact.push(path);
      }
      const created = input.plan.createOnly;
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        try {
          writeFileSync(join(root, path), text, created ? { flag: "wx" } : undefined);
        } catch (error) {
          if (created && (error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new Error(created.inTheWay);
          }
          throw error;
        }
      }
      rmSync(join(root, rel), { force: true });
      return checked.digest;
    },
    retryPrompt: (reason) => retryPrompt(input.prompt, reason),
  };
}
