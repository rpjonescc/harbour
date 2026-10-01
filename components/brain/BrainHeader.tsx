import type { ReactNode } from "react";
import { ReindexButton } from "./ReindexButton";

/** Page title, search slot, and any index/watcher problem. */
export function BrainHeader({
  watchError,
  children,
}: {
  watchError: string | null;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl">Second Brain</h1>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {watchError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn"
        >
          <span>Search index may be stale: {watchError}</span>
          <ReindexButton />
        </div>
      )}
    </header>
  );
}
