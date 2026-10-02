import type { LatestRun } from "@/lib/note/view";
import { endOfWait } from "./end-of-wait";

const WAIT = { jobId: 12, since: "A" };
const run = (id: number, status: LatestRun["status"]): LatestRun => ({ id, status });

describe("endOfWait", () => {
  it("goes on while nothing has changed", () => {
    expect(endOfWait(WAIT, "A", null)).toBeNull();
    expect(endOfWait(WAIT, "A", run(11, "ok"))).toBeNull(); // an older run
    expect(endOfWait(WAIT, "A", run(12, "queued"))).toBeNull();
    expect(endOfWait(WAIT, "A", run(12, "running"))).toBeNull();
  });

  it("ends in done when a newer note shows, whatever the runs say", () => {
    expect(endOfWait(WAIT, "B", null)).toBe("done");
    expect(endOfWait(WAIT, "B", run(11, "failed"))).toBe("done");
  });

  it("ends in done when its own run succeeded, even if the note's minute did not change", () => {
    expect(endOfWait(WAIT, "A", run(12, "ok"))).toBe("done");
  });

  it("ends in failed when its own run failed", () => {
    expect(endOfWait(WAIT, "A", run(12, "failed"))).toBe("failed");
  });

  it("ends quietly when the owner cancelled the run, or a later run has taken over", () => {
    expect(endOfWait(WAIT, "A", run(12, "cancelled"))).toBe("done");
    expect(endOfWait(WAIT, "A", run(13, "queued"))).toBe("done");
  });

  it("does not take a failure from before the request for its own", () => {
    expect(endOfWait(WAIT, "A", run(9, "failed"))).toBeNull();
  });
});
