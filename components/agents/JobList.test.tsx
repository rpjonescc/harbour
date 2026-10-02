// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
    const notices = screen.getAllByText("Suggestions not imported — run the agent again");
    expect(notices).toHaveLength(1);
    expect(notices[0]?.closest("tr")).toHaveTextContent("2026-W39");
  });
});
