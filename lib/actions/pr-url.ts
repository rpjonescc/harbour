import { z } from "zod";

/** Longest pull request URL Harbour stores. */
const MAX_PR_URL = 200;

// Exactly one GitHub pull request page: no credentials, port, sub-page, query or fragment.
const PR_PATTERN =
  /^https:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/([1-9]\d{0,9})\/?$/;

const dotsOnly = (segment: string) => /^\.+$/.test(segment);

/** A GitHub pull request URL, trimmed and without a trailing slash. */
const PullRequestUrl = z
  .string()
  .trim()
  .max(MAX_PR_URL)
  .transform((raw, ctx) => {
    const match = PR_PATTERN.exec(raw);
    const [, owner = "", repo = "", number = ""] = match ?? [];
    if (!match || dotsOnly(owner) || dotsOnly(repo)) {
      ctx.addIssue({ code: "custom", message: "Not a GitHub pull request URL" });
      return z.NEVER;
    }
    return `https://github.com/${owner}/${repo}/pull/${number}`;
  });

/** The normalised URL, or `ok: false` for anything but a GitHub pull request URL. */
export function parsePullRequestUrl(raw: string): { ok: true; url: string } | { ok: false } {
  const parsed = PullRequestUrl.safeParse(raw);
  return parsed.success ? { ok: true, url: parsed.data } : { ok: false };
}

/** `owner/repo` and the number of a stored pull request URL; null if it does not parse. */
export function pullRequestLabel(url: string): { repo: string; number: string } | null {
  const [, owner, repo, number] = PR_PATTERN.exec(url) ?? [];
  if (!owner || !repo || !number) return null;
  return { repo: `${owner}/${repo}`, number };
}
