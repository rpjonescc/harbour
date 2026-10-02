import { parse, stringify } from "yaml";
import type { z } from "zod";
import { safeReason } from "@/lib/explain/voice/note";

export type Parsed<T> = { ok: true; value: T; body: string } | { ok: false; reason: string };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Frontmatter and body as one markdown file; `lineWidth: 0` keeps long strings on one line. */
export function renderFile(front: Record<string, unknown>, body: string): string {
  return `---\n${stringify(front, { lineWidth: 0 })}---\n${body.replace(/\s+$/, "")}\n`;
}

/** A reason built from zod's paths and fixed words only: never the file's own values. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) =>
      issue.code === "unrecognized_keys"
        ? "it has a field that is not part of the format"
        : `${safeReason(issue.path.map(String).join(".") || "the file")}: ${issue.message}`,
    )
    .join("; ");
}

/**
 * Parses frontmatter and body and validates the frontmatter with `schema`. Aliases are refused
 * (expansion attacks). Never throws: an unreadable file is a reason.
 */
export function parseFile<T>(text: string, schema: z.ZodType<T>): Parsed<T> {
  const match = FRONTMATTER.exec(text.replace(/^﻿/, ""));
  if (!match) return { ok: false, reason: "The file has no frontmatter between two --- lines." };
  let data: unknown;
  try {
    data = parse(match[1] ?? "", { maxAliasCount: 0, logLevel: "error" });
  } catch {
    return { ok: false, reason: "The frontmatter is not valid YAML." };
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    return { ok: false, reason: `The frontmatter is not valid: ${describeIssues(result.error)}.` };
  }
  return { ok: true, value: result.data, body: match[2] ?? "" };
}
