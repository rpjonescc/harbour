// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { NOTE_RUN_FAILED_LINE, RUN_FAILED_LINE, runFailedLine } from "@/lib/explain/agents";
import { textOutsideDetails } from "@/tests/helpers/plain-text";
import { RunActivity } from "./RunActivity";
import type { RunJob } from "./run-types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth/client-api", () => ({ postJson: vi.fn() }));

const running: RunJob = {
  id: 7,
  kind: "research",
  status: "running",
  error: null,
  label: "Research: Glossary",
  createdAt: "2026-10-01T00:00:00.000Z",
  startedAt: "2026-10-01T00:00:00.000Z",
  finishedAt: null,
};

describe("RunActivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:05.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the ticking elapsed time out of the live region", async () => {
    const { container } = render(<RunActivity job={running} events={[]} />);
    await act(() => vi.advanceTimersByTimeAsync(3000));
    const live = container.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0]?.textContent).toBe("Running now");
    expect(container.textContent).toContain("8s");
  });

  it("says a failed run didn't finish and tucks the raw error and the log under Technical details", () => {
    const { container } = render(
      <RunActivity
        job={{ ...running, status: "failed", error: "spawn claude ENOENT" }}
        events={[
          { id: 1, kind: "error", text: "spawn claude ENOENT", at: "2026-10-01T00:00:01.000Z" },
        ]}
      />,
    );
    expect(screen.getByText("Didn't finish")).toBeInTheDocument();
    expect(screen.getByText(RUN_FAILED_LINE)).toBeInTheDocument();
    expect(textOutsideDetails(container)).not.toContain("ENOENT");
    expect(container.querySelector("summary")?.textContent).toMatch(
      /Technical details.*step-by-step log of the run/,
    );
  });

  it("still tells the owner what to do when a failed run has no error text", () => {
    render(<RunActivity job={{ ...running, status: "failed", error: null }} events={[]} />);
    expect(screen.getByText(RUN_FAILED_LINE)).toBeInTheDocument();
  });

  it("sends a failed daily note's owner to Today, not the Agents page", () => {
    render(
      <RunActivity
        job={{ ...running, kind: "daily-note", status: "failed", error: "x" }}
        events={[]}
      />,
    );
    expect(screen.getByText(NOTE_RUN_FAILED_LINE)).toBeInTheDocument();
    expect(screen.queryByText(RUN_FAILED_LINE)).toBeNull();
  });

  it("sends a failed check's owner to the product's page, not the Agents page", () => {
    render(<RunActivity job={{ ...running, kind: "scan", status: "failed" }} events={[]} />);
    expect(screen.getByText(runFailedLine("scan"))).toBeInTheDocument();
    expect(screen.queryByText(RUN_FAILED_LINE)).toBeNull();
  });

  it("offers Stop this run while it is active", () => {
    render(<RunActivity job={running} events={[]} />);
    expect(screen.getByRole("button", { name: "Stop this run" })).toBeInTheDocument();
  });
});
