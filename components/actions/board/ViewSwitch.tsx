import Link from "next/link";
import type { ActionsView } from "@/lib/actions/board-view";
import type { ActionFilter } from "@/lib/actions/views";
import { BOARD_TEXT } from "@/lib/explain/board";

const VIEWS: readonly ActionsView[] = ["board", "list"];

/** The URL of a view with the product and area filters kept (the list keeps its status too). */
export function viewHref(view: ActionsView, filter: ActionFilter): string {
  const params = new URLSearchParams();
  if (view === "list") params.set("view", "list");
  if (filter.productId) params.set("product", filter.productId);
  if (filter.area) params.set("area", filter.area);
  if (view === "list" && filter.status !== "active") params.set("status", filter.status);
  const query = params.toString();
  return query ? `/actions?${query}` : "/actions";
}

/** "View: Board | List" as two links; the current one is marked for screen readers too. */
export function ViewSwitch({ view, filter }: { view: ActionsView; filter: ActionFilter }) {
  return (
    <nav aria-label={BOARD_TEXT.view} className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className="text-ink-muted">
        {BOARD_TEXT.view}:
      </span>
      <ul className="flex gap-1 rounded-md bg-surface-sunk p-1">
        {VIEWS.map((option) => (
          <li key={option}>
            <Link
              href={viewHref(option, filter)}
              aria-current={option === view ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-sm px-4 text-ink-muted hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-ink"
            >
              {BOARD_TEXT[option]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
