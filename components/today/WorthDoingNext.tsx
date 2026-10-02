import Link from "next/link";
import { EmptyState } from "@/components/explain/EmptyState";
import type { ActionPreview } from "@/lib/today/types";
import { ActionCard } from "./ActionCard";

/** What Today says when nothing is open. */
export const NOTHING_TO_DO = {
  what: "Nothing to do right now.",
  when: "New ideas appear here after each daily check and each weekly report.",
  why: "Harbour only suggests a change when a check finds something worth fixing.",
} as const;

/** Today's top actions as plain cards, with the rest a link away on the Actions board. */
export function WorthDoingNext({ actions, more }: { actions: ActionPreview[]; more: number }) {
  return (
    <section aria-labelledby="worth-doing-heading" className="flex flex-col gap-3">
      <h2 id="worth-doing-heading" className="font-serif text-xl">
        Worth doing next
      </h2>
      {actions.length === 0 ? (
        <EmptyState {...NOTHING_TO_DO} />
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            The changes most likely to help, biggest wins first.
          </p>
          {actions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </>
      )}
      {more > 0 && (
        <p className="text-sm">
          <Link href="/actions" className="rounded-sm text-accent underline underline-offset-2">
            {more} more on the Actions board
          </Link>
        </p>
      )}
    </section>
  );
}
