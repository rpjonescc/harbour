import type { ReactNode } from "react";
import { ReindexButton } from "./ReindexButton";

/** Page title, search slot, and any index/watcher problem. */
export function BrainHeader({
  watchError,
  indexError,
  titleLevel = 1,
  children,
}: {
  watchError: string | null;
  indexError: string | null;
  /** 2 when shown inside another page, such as the /design examples. */
  titleLevel?: 1 | 2;
  children?: ReactNode;
}) {
  const Title = titleLevel === 1 ? "h1" : "h2";
  const problems = [indexError, watchError].filter((problem) => problem !== null);
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title className="font-serif text-3xl">Second Brain</Title>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {problems.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn"
        >
          <span>Search index may be stale: {problems.join("; ")}</span>
          <ReindexButton />
        </div>
      )}
    </header>
  );
}
