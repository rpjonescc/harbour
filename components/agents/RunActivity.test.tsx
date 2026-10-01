// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
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
    expect(live[0]?.textContent).toBe("Running");
    expect(container.textContent).toContain("8s");
  });
});
