// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("says what will appear, when and why", () => {
    const { container } = render(
      <EmptyState
        what="Nothing to do right now."
        when="New ideas appear here after each daily check and each weekly report."
        why="Harbour only suggests a change when a check finds something worth fixing."
      />,
    );
    expect(screen.getByText("Nothing to do right now.")).toBeVisible();
    expect(container).toHaveTextContent(
      "Nothing to do right now. New ideas appear here after each daily check and each weekly report. Harbour only suggests a change when a check finds something worth fixing.",
    );
  });
});
