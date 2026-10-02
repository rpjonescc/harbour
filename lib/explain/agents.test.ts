import type { JobStatus } from "@/lib/jobs/queue";
import {
  AGENT_PURPOSE,
  AGENTS_INTRO,
  JOB_STATUS_PHRASE,
  NOTE_RUN_FAILED_LINE,
  RUN_FAILED_LINE,
  RUN_HEADLINE,
  runFailedLine,
} from "./agents";

const STATUSES: JobStatus[] = ["queued", "running", "ok", "failed", "cancelled"];

describe("Agents words", () => {
  it("never shows a raw job status", () => {
    for (const status of STATUSES) {
      expect(JOB_STATUS_PHRASE[status]).not.toBe(status);
      expect(RUN_HEADLINE[status].length).toBeGreaterThan(3);
    }
  });

  it("says what to do when a run didn't finish", () => {
    expect(RUN_FAILED_LINE).toMatch(/start it again/);
    expect(NOTE_RUN_FAILED_LINE).toMatch(/fresh one on Today/);
  });

  it("gives each kind of run a next step that works for it", () => {
    for (const kind of ["research", "discovery", "weekly-analyst"] as const)
      expect(runFailedLine(kind)).toBe(RUN_FAILED_LINE);
    expect(runFailedLine("daily-note")).toBe(NOTE_RUN_FAILED_LINE);
    expect(runFailedLine("scan")).toMatch(/Choose Check now on the product's page\.$/);
    expect(runFailedLine("backup")).toMatch(/Choose Back up now in Settings\.$/);
    for (const kind of ["retention", "brain-push", "notes-sync"] as const)
      expect(runFailedLine(kind)).toMatch(/Harbour tries again at the next run\.$/);
  });

  it("keeps every line short and free of setting names", () => {
    const kinds = ["scan", "backup", "retention", "brain-push", "notes-sync"] as const;
    const lines = [
      AGENTS_INTRO,
      ...Object.values(AGENT_PURPOSE),
      RUN_FAILED_LINE,
      ...kinds.map(runFailedLine),
    ];
    for (const line of [...lines, NOTE_RUN_FAILED_LINE]) {
      expect(line.length).toBeLessThanOrEqual(120);
      expect(line).not.toMatch(/HARBOUR_|\.env/);
    }
  });
});
