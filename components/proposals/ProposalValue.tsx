import { Tag } from "@/components/ui/Tag";
import type { ProposalRow } from "@/lib/agents/proposals";
import { intentLabel } from "@/lib/explain/approvals";

/** What a proposal says, by type. All text renders as plain text (React escapes it). */
export function ProposalValue({ item }: { item: ProposalRow }) {
  const v = item.value;
  if (item.type === "keyword") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{v.term}</span>
        {v.intent && <Tag tone="neutral">{intentLabel(v.intent)}</Tag>}
        {v.location && <span className="text-ink-muted">{v.location}</span>}
      </p>
    );
  }
  if (item.type === "question") return <p className="text-sm font-medium">{v.text}</p>;
  if (item.type === "pillar") {
    return (
      <p className="text-sm">
        <span className="font-medium">{v.name}</span>{" "}
        <span className="text-ink-muted">{v.description}</span>
      </p>
    );
  }
  const url = v.url ?? "";
  const safe = /^https?:\/\//i.test(url);
  return (
    <p className="text-sm">
      <span className="font-medium">{v.name}</span>{" "}
      {safe ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2"
        >
          {url}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span className="text-ink-muted">{url}</span>
      )}
    </p>
  );
}
