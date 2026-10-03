import { CircleCheck, Eye, Hammer, Inbox, ListOrdered, type LucideIcon, Play } from "lucide-react";
import type { BoardColumnId } from "@/lib/actions/board-column";

/** A small icon per column, always shown beside the column's name (never instead of it). */
export const COLUMN_ICON: Readonly<Record<BoardColumnId, LucideIcon>> = {
  backlog: Inbox,
  queue: ListOrdered,
  started: Play,
  in_progress: Hammer,
  in_review: Eye,
  done: CircleCheck,
};
