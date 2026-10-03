// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { useBoardDrag } from "./useBoardDrag";

/** Just enough of a drag event for the hook: what it reads and whether it was cancelled. */
function dragEvent() {
  const event = {
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" },
    currentTarget: { contains: () => false },
    relatedTarget: null,
  };
  return event;
}
const asDrag = (event: ReturnType<typeof dragEvent>) => event as unknown as DragEvent<HTMLElement>;

function setup(refresh: unknown = {}) {
  const onDrop = vi.fn();
  const hook = renderHook(({ columns }) => useBoardDrag(onDrop, columns), {
    initialProps: { columns: refresh },
  });
  return { onDrop, hook };
}

describe("useBoardDrag", () => {
  it("accepts a dragover that comes before React re-renders after dragstart", () => {
    const { onDrop, hook } = setup();
    // One render's handlers: a quick flick sends dragover and drop before any re-render.
    const { card, zone } = hook.result.current;
    const over = dragEvent();
    const drop = dragEvent();
    act(() => {
      card(7).onDragStart(asDrag(dragEvent()));
      zone("done").onDragOver(asDrag(over));
      zone("done").onDrop(asDrag(drop));
    });
    expect(over.defaultPrevented).toBe(true);
    expect(onDrop).toHaveBeenCalledWith(7, "done");
  });

  it("ignores a drag it did not start", () => {
    const { onDrop, hook } = setup();
    const over = dragEvent();
    act(() => {
      hook.result.current.zone("done").onDragOver(asDrag(over));
      hook.result.current.zone("done").onDrop(asDrag(dragEvent()));
    });
    expect(over.defaultPrevented).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("forgets the dragged card when the columns refresh, as its dragend may never come", () => {
    const { onDrop, hook } = setup();
    act(() => hook.result.current.card(7).onDragStart(asDrag(dragEvent())));
    expect(hook.result.current.dragging).toBe(7);
    hook.rerender({ columns: {} });
    const over = dragEvent();
    act(() => {
      hook.result.current.zone("done").onDragOver(asDrag(over));
      hook.result.current.zone("done").onDrop(asDrag(dragEvent()));
    });
    expect(over.defaultPrevented).toBe(false);
    expect(hook.result.current.dragging).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
  });
});
