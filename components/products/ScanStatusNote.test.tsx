// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ScanState, ScoreSnapshot } from "@/lib/scan/views";
import { ScanStatusNote } from "./ScanStatusNote";

const AT = new Date("2026-10-01T06:04:00Z");
const note = (scan: ScanState, latest: ScoreSnapshot | null = null) =>
  render(<ScanStatusNote scan={scan} latest={latest} timeZone="UTC" locale="en-GB" />);
const last = (over: Partial<NonNullable<ScanState["last"]>>): ScanState => ({
  active: null,
  last: {
    scanId: 1,
    status: "failed",
    startedAt: AT,
    finishedAt: AT,
    error: null,
    failedCollectors: [],
    ...over,
  },
});

describe("ScanStatusNote", () => {
  it("explains a failed scan in words and keeps the raw error under Technical details", () => {
    note(last({ error: "All collectors failed" }));
    expect(
      screen.getByText(
        "The last scan didn't finish (1 Oct 2026, 06:04). There are no results yet. Try Scan now again.",
      ),
    ).toBeInTheDocument();
    const details = screen.getByText(/Technical details/).closest("details") as HTMLElement;
    expect(within(details).getByText("All collectors failed")).toBeInTheDocument();
  });

  it("names a data source that had a problem in plain words, with its raw error folded away", () => {
    note(
      last({
        status: "partial",
        failedCollectors: [{ collector: "pagespeed", error: "quota exceeded" }],
      }),
    );
    expect(
      screen.getByText("Google's speed test didn't answer in the last check"),
    ).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed: quota exceeded/).closest("details")).not.toBeNull();
    expect(screen.queryByText(/PageSpeed failed/)).toBeNull();
  });

  it("shows no Technical details when there is nothing raw to show", () => {
    note(last({ status: "ok" }));
    expect(screen.getByText(/^Last scan 1 Oct 2026, 06:04\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/Technical details/)).toBeNull();
  });

  it("says what to do before the first scan, and while one runs", () => {
    const { unmount } = note({ active: null, last: null });
    expect(screen.getByText(/hasn't scanned this site yet/)).toBeInTheDocument();
    unmount();
    note({ active: { jobId: 4, status: "running", since: AT }, last: null });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Scanning now (started 1 Oct 2026, 06:04)",
    );
  });
});
