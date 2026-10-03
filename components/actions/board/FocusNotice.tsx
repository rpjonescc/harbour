import Link from "next/link";
import type { BoardFocus } from "@/lib/actions/board-view";
import type { ActionFilter } from "@/lib/actions/views";
import { FOCUS_TEXT } from "@/lib/explain/board";
import { viewHref } from "./ViewSwitch";

/** One plain line while the board is narrowed to stuck or needs-you cards, with the way back. */
export function FocusNotice({ focus, filter }: { focus: BoardFocus | null; filter: ActionFilter }) {
  if (!focus) return null;
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 text-sm text-ink">
      <span>{FOCUS_TEXT[focus]}</span>
      <Link
        href={viewHref("board", filter)}
        className="inline-flex min-h-11 items-center rounded-sm text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {FOCUS_TEXT.clear}
      </Link>
    </p>
  );
}
