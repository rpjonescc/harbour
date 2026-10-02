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
      screen.getByText("The last check didn't finish and there are no results yet. Try Check now."),
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

  it("says which scan the results on screen are from, taken from the latest scores", () => {
    const latest = { computedAt: new Date("2026-09-30T06:00:00Z") } as ScoreSnapshot;
    note(last({}), latest);
    expect(
      screen.getByText(
        "The last check didn't finish, so you're seeing the 30 Sept 2026, 06:00 results. Try Check now.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps a partial scan to one sentence with what to do", () => {
    note(last({ status: "partial", failedCollectors: [{ collector: "pagespeed", error: null }] }));
    expect(
      screen.getByText(
        "Last check 1 Oct 2026, 06:04 had a data source problem, so some scores may be missing. Try Check now.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed: no message recorded/)).toBeInTheDocument();
  });

  it("shows no Technical details when there is nothing raw to show", () => {
    note(last({ status: "ok" }));
    expect(screen.getByText(/^Last check 1 Oct 2026, 06:04\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/Technical details/)).toBeNull();
  });

  it("does not say Try Check now while a scan runs after a failed one", () => {
    note({ ...last({ error: "boom" }), active: { jobId: 4, status: "running", since: AT } });
    expect(screen.getByRole("status")).toHaveTextContent("Checking now");
    expect(
      screen.getByText("The last check didn't finish and there are no results yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Try Check now/)).toBeNull();
  });

  it("says what to do before the first scan, and while one runs", () => {
    const { unmount } = note({ active: null, last: null });
    expect(screen.getByText(/hasn't checked this site yet/)).toBeInTheDocument();
    unmount();
    const { unmount: unmount2 } = note({
      active: { jobId: 5, status: "queued", since: AT },
      last: null,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "A check is waiting to start; this page updates when it finishes.",
    );
    unmount2();
    note({ active: { jobId: 4, status: "running", since: AT }, last: null });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking now (started 1 Oct 2026, 06:04)",
    );
  });
});
