/** Space between the Move to… button and its menu, in px. */
const GAP = 4;

type Box = { top: number; bottom: number; left: number };

/**
 * Where the Move to… menu goes, in viewport px for `position: fixed`: under its button, or above it
 * when it would run off the bottom of the window and fits above.
 */
export function menuPosition(trigger: Box, menuHeight: number, viewportHeight: number) {
  const below = trigger.bottom + GAP;
  const above = trigger.top - menuHeight - GAP;
  const top = below + menuHeight > viewportHeight && above >= 0 ? above : below;
  return { top, left: trigger.left };
}
