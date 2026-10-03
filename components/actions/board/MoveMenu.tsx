"use client";

import { ArrowRightLeft } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BOARD_COLUMNS, type BoardColumnId } from "@/lib/actions/board-column";
import { BOARD_TEXT, COLUMN_COPY } from "@/lib/explain/board";
import { COLUMN_ICON } from "./column-icons";
import { menuPosition } from "./menu-position";

const TARGET = "min-h-11 rounded-sm text-sm";

/**
 * Shows the open menu in the top layer (a manual popover), placed by its button and kept there as
 * the page or the lanes scroll: the lanes scroll sideways, so a menu inside them would be clipped.
 * It stays in the button's place in the DOM, so Tab order and focus checks are unchanged.
 */
function useTopLayer(open: boolean) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current;
    if (!open || !element) return;
    // Set here, not in the markup: where the popover API is missing (jsdom) the menu still shows.
    if (typeof element.showPopover === "function") {
      element.setAttribute("popover", "manual");
      element.showPopover();
    }
    const place = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box) return;
      const { top, left } = menuPosition(box, element.offsetHeight, window.innerHeight);
      element.style.top = `${top}px`;
      element.style.left = `${left}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  return { trigger, menu };
}

/**
 * The keyboard and touch way to move a card: a menu button listing the other columns. Enter or
 * Space opens it, arrow keys choose, Enter moves, Escape closes and gives focus back.
 */
export function MoveMenu({
  title,
  current,
  onMove,
}: {
  title: string;
  current: BoardColumnId;
  onMove: (to: BoardColumnId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const { trigger, menu } = useTopLayer(open);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const targets = BOARD_COLUMNS.filter((column) => column !== current);

  useEffect(() => {
    if (open) items.current[first]?.focus();
  }, [open, first]);

  function show(at: number) {
    setFirst(at);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  /** Focus leaving the button and menu altogether (a click or Tab elsewhere) closes the menu. */
  function closeOnLeave(event: FocusEvent) {
    if (!wrapper.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  function choose(to: BoardColumnId) {
    close();
    onMove(to);
  }

  function onTriggerKey(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    show(event.key === "ArrowDown" ? 0 : targets.length - 1);
  }

  function onMenuKey(event: KeyboardEvent) {
    const at = items.current.indexOf(document.activeElement as HTMLButtonElement | null);
    const go = (index: number) => {
      event.preventDefault();
      items.current[(index + targets.length) % targets.length]?.focus();
    };
    if (event.key === "ArrowDown") return go(at + 1);
    if (event.key === "ArrowUp") return go(at - 1);
    if (event.key === "Home") return go(0);
    if (event.key === "End") return go(targets.length - 1);
    if (event.key === "Escape") {
      event.preventDefault();
      return close();
    }
    if (event.key === "Tab") setOpen(false);
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${BOARD_TEXT.moveTo} ${title}`}
        onClick={() => (open ? setOpen(false) : show(0))}
        onKeyDown={onTriggerKey}
        onBlur={closeOnLeave}
        className={`${TARGET} inline-flex items-center gap-1.5 border border-line px-3 text-ink-muted hover:bg-surface-sunk hover:text-ink`}
      >
        <ArrowRightLeft aria-hidden="true" className="size-4" />
        {BOARD_TEXT.moveTo}
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={BOARD_TEXT.moveMenu(title)}
          onKeyDown={onMenuKey}
          onBlur={closeOnLeave}
          className="fixed inset-auto m-0 flex w-48 flex-col rounded-md border border-line bg-surface p-1 text-ink shadow-overlay"
        >
          {targets.map((column, index) => {
            const Icon = COLUMN_ICON[column];
            return (
              <button
                key={column}
                ref={(element) => {
                  items.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => choose(column)}
                className={`${TARGET} flex items-center gap-2 px-2 text-left text-ink hover:bg-surface-sunk focus:bg-surface-sunk`}
              >
                <Icon aria-hidden="true" className="size-4 text-ink-muted" />
                {COLUMN_COPY[column].name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
