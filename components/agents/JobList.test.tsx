// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { Job } from "@/lib/jobs/queue";
import { JobList } from "./JobList";

const job = (id: number, week: string): Job => ({
  id,
  kind: "weekly-analyst",
  params: { week },
  dedupeKey: `weekly-analyst:${week}`,
  status: "ok",
  requestedBy: null,
  createdAt: new Date("2026-10-04T09:00:00Z"),
  startedAt: new Date("2026-10-04T09:00:00Z"),
  finishedAt: new Date("2026-10-04T09:05:00Z"),
  heartbeatAt: null,
  cancelRequested: false,
  notBefore: null,
  error: null,
  result: null,
});

describe("JobList", () => {
  it("shows a plain status word, never ok or failed", () => {
    render(
      <JobList jobs={[job(2, "2026-W40")]} products={[]} timeZone="Europe/London" locale="en-GB" />,
    );
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText("ok")).toBeNull();
  });

  it("says when a run that never started finished, and that a queued one hasn't started", () => {
    const never = { ...job(4, "2026-W42"), startedAt: null };
    const queued = { ...never, id: 5, status: "queued" as const, finishedAt: null };
    render(
      <JobList jobs={[queued, never]} products={[]} timeZone="Europe/London" locale="en-GB" />,
    );
    const runs = screen.getByRole("list", { name: "Recent runs" });
    expect(runs).toHaveTextContent(/Finished /);
    expect(within(runs).getAllByText("Not started yet")).toHaveLength(1);
  });

  it("explains an empty list", () => {
    render(<JobList jobs={[]} products={[]} timeZone="Europe/London" locale="en-GB" />);
    expect(screen.getByText(/appears here as soon as you start one/)).toBeInTheDocument();
  });

  it("says which runs' suggestions were never imported", () => {
    render(
      <JobList
        jobs={[job(2, "2026-W40"), job(1, "2026-W39")]}
        products={[]}
        timeZone="Europe/London"
        locale="en-GB"
        importsGivenUp={new Set([1])}
      />,
    );
    const notices = screen.getAllByText(
      "Claude's ideas from this run weren't saved. Run it again.",
    );
    expect(notices).toHaveLength(1);
    const row = notices[0]?.closest("li");
    expect(row?.querySelector("a")).toHaveAttribute("href", "/agents/1");
  });

  it("says each run in plain words, with its job name only under Technical details", () => {
    const failed = { ...job(3, "2026-W41"), status: "failed" as const };
    render(
      <JobList
        jobs={[failed, job(2, "2026-W40")]}
        products={[]}
        timeZone="Europe/London"
        locale="en-GB"
      />,
    );
    const runs = screen.getByRole("list", { name: "Recent runs" });
    expect(within(runs).getByRole("link", { name: "Wrote the weekly report." })).toHaveAttribute(
      "href",
      "/agents/2",
    );
    expect(
      within(runs).getByRole("link", { name: "Didn't finish writing the weekly report." }),
    ).toBeInTheDocument();
    expect(runs).not.toHaveTextContent("Weekly");
    expect(runs).toHaveTextContent(/Started .* · took 5m 00s/);
    expect(runs).not.toHaveTextContent("Not started yet");
    const details = screen.getByText(/^Technical details/).closest("details");
    expect(details).toHaveTextContent("(weekly-analyst)");
  });
});
