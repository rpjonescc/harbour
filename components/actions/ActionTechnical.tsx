import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { CopyPromptButton } from "@/components/ui/CopyPromptButton";
import { actionHandoffPrompt } from "@/lib/actions/handoff";
import type { ActionView } from "@/lib/actions/views";
import { brainHref } from "@/lib/brain/wikilinks";
import type { Product } from "@/lib/products/catalog";
import { ActionEvidence } from "./ActionEvidence";
import { SOURCE_LABEL } from "./action-labels";

function DocLinks({ action }: { action: ActionView }) {
  const { docLinks: links, docsInvalid: invalid } = action;
  if (invalid) return <p className="text-ink-muted">Harbour could not read the related docs.</p>;
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label={`Related docs: ${action.title}`}>
      {links.map(({ path, exists }) => (
        <li key={path} className="break-all font-mono">
          {exists ? (
            <Link
              href={brainHref(path)}
              className="rounded-sm text-accent underline underline-offset-2"
            >
              {path}
            </Link>
          ) : (
            <span className="text-ink-muted">{path} (not in the brain)</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * What the owner rarely needs but Claude and the curious do: the exact fix and check, where the
 * action came from, its rule, the evidence, related docs and the "Hand to Claude" prompt.
 */
export function ActionTechnical({ action, product }: { action: ActionView; product: Product }) {
  return (
    <TechnicalDetails
      id="action-card"
      topic={`evidence, source and the prompt for Claude: ${action.title}`}
    >
      <div className="flex flex-col gap-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-muted">Fix</dt>
          <dd>{action.fix}</dd>
          <dt className="text-ink-muted">Done when</dt>
          <dd>{action.check}</dd>
          <dt className="text-ink-muted">Source</dt>
          <dd>{SOURCE_LABEL[action.source]}</dd>
          {action.ruleKey && (
            <>
              <dt className="text-ink-muted">Rule</dt>
              <dd className="font-mono">{action.ruleKey}</dd>
            </>
          )}
        </dl>
        <ActionEvidence evidence={action.evidence} invalid={action.evidenceInvalid} />
        <DocLinks action={action} />
        <CopyPromptButton prompt={actionHandoffPrompt(product, action)} title={action.title} />
      </div>
    </TechnicalDetails>
  );
}
