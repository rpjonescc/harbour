/** Space between the Move to… button and its menu, and the least space kept to the window edge, in px. */
const GAP = 4;
const EDGE = 8;

type Box = { top: number; bottom: number; left: number; right: number };

/**
 * Where the Move to… menu goes, in viewport px for `position: fixed`: under its button, or above it
 * when it would run off the bottom of the window and fits above. Its right edge lines up with the
 * button's (the button sits at a card's right), kept inside the window on a narrow screen.
 */
export function menuPosition(
  trigger: Box,
  menu: { height: number; width: number },
  viewport: { height: number; width: number },
) {
  const below = trigger.bottom + GAP;
  const above = trigger.top - menu.height - GAP;
  const top = below + menu.height > viewport.height && above >= 0 ? above : below;
  const left = Math.max(
    EDGE,
    Math.min(trigger.right - menu.width, viewport.width - menu.width - EDGE),
  );
  return { top, left };
}
