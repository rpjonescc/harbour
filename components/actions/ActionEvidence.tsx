import type { Evidence } from "@/lib/actions/types";

/** Only http(s) URLs become links: evidence comes from crawls and the analyst. */
function isHttp(url: string | null): url is string {
  const parsed = url === null ? null : URL.parse(url);
  return parsed?.protocol === "http:" || parsed?.protocol === "https:";
}

/** The evidence behind an action, folded away; a value that failed validation is a gap. */
export function ActionEvidence({ evidence, invalid }: { evidence: Evidence; invalid: boolean }) {
  if (invalid) {
    return <p className="text-xs text-ink-muted">Harbour could not read the stored evidence.</p>;
  }
  if (evidence.total === 0) return null;
  const more = evidence.total - evidence.items.length;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer rounded-sm text-accent">
        Evidence ({evidence.total})
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5 break-all text-ink-muted">
        {evidence.items.map(({ text, url }, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stored evidence never reorders
          <li key={index}>
            {isHttp(url) ? (
              <a
                href={url}
                rel="noopener noreferrer nofollow"
                className="rounded-sm text-accent underline underline-offset-2"
              >
                {text}
              </a>
            ) : (
              text
            )}
          </li>
        ))}
        {more > 0 && <li>…and {more} more</li>}
      </ul>
    </details>
  );
}
