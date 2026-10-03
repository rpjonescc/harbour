// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { HEADLINE_UNREAD, UPDATES_PAUSED } from "@/lib/explain/tower";
import { WORKER_SENTENCE } from "@/lib/explain/tower-lights";
import { TowerHeaderExamples } from "./TowerHeaderExamples";

describe("TowerHeaderExamples", () => {
  it("shows every headline shape and the paused line, with no heading of its own", () => {
    render(<TowerHeaderExamples />);
    expect(screen.getAllByText(/^Everything is running\./)).toHaveLength(2);
    expect(screen.getByText(WORKER_SENTENCE.stopped, { exact: false })).toBeVisible();
    expect(screen.getByText(/Nothing is broken\. 2 lights are worth a look\./)).toBeVisible();
    expect(screen.getByText(HEADLINE_UNREAD.systems, { exact: false })).toBeVisible();
    expect(screen.getByText(UPDATES_PAUSED, { exact: false })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
