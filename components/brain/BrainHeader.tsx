import type { ReactNode } from "react";
import { PageHeader } from "@/components/explain/PageHeader";
import { TermLine } from "@/components/explain/TermLine";
import { BRAIN_INTRO } from "@/lib/explain/brain-page";
import type { PageVerdict } from "@/lib/explain/page-verdict";
import { ReindexButton } from "./ReindexButton";

/** Page title, its verdict, search slot, and any index/watcher problem. */
export function BrainHeader({
  watchError,
  indexError,
  verdict,
  titleLevel = 1,
  children,
}: {
  watchError: string | null;
  indexError: string | null;
  verdict?: PageVerdict;
  /** 2 when shown inside another page, such as the /design examples. */
  titleLevel?: 1 | 2;
  children?: ReactNode;
}) {
  const problems = [indexError, watchError].filter((problem) => problem !== null);
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Second Brain"
        page="brain"
        titleLevel={titleLevel}
        verdict={verdict}
        intro={
          <p>
            <TermLine line={BRAIN_INTRO} />
          </p>
        }
      >
        {children}
      </PageHeader>
      {problems.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn"
        >
          <span>Search index may be stale: {problems.join("; ")}</span>
          <ReindexButton />
        </div>
      )}
    </div>
  );
}
