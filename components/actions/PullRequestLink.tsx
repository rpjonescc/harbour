import { pullRequestLabel } from "@/lib/actions/pr-url";

/**
 * The pull request that fixes an action, opened in a new tab. The stored URL is re-checked:
 * anything but a GitHub pull request URL shows nothing rather than an untrusted link.
 */
export function PullRequestLink({ url }: { url: string | null }) {
  const label = url === null ? null : pullRequestLabel(url);
  if (url === null || label === null) return null;
  return (
    <p className="text-xs">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-sm text-accent underline underline-offset-2"
      >
        Pull request {label.repo}#{label.number}{" "}
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </p>
  );
}
