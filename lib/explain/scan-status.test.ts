import { activeScanSentence, lastScanSentence, NEVER_SCANNED, SCAN_NOW } from "./scan-status";

describe("scan status sentences", () => {
  it("says what happens for a site that was never scanned", () => {
    expect(NEVER_SCANNED).toMatch(/hasn't scanned this site yet.*Scan now.*scores appear/);
  });

  it("says a scan is running or waiting, and that the page updates", () => {
    expect(activeScanSentence("running", "1 Oct 2026, 06:04")).toBe(
      "Scanning now (started 1 Oct 2026, 06:04). This page updates when it finishes.",
    );
    expect(activeScanSentence("queued", "x")).toBe(
      "A scan is waiting to start. It begins as soon as Harbour is free. This page updates when it finishes.",
    );
  });

  it("says how the last scan ended and what to do", () => {
    const when = "1 Oct 2026, 06:04";
    expect(lastScanSentence({ status: "ok", when, showing: null })).toBe(
      "Last scan 1 Oct 2026, 06:04.",
    );
    expect(lastScanSentence({ status: "partial", when, showing: null })).toBe(
      "Last scan 1 Oct 2026, 06:04. Some data sources had a problem, so some scores may be missing for now.",
    );
    expect(lastScanSentence({ status: "failed", when, showing: "30 Sept 2026, 06:00" })).toBe(
      "The last scan didn't finish (1 Oct 2026, 06:04). You're seeing the results of the scan from 30 Sept 2026, 06:00. Try Scan now again.",
    );
    expect(lastScanSentence({ status: "failed", when, showing: null })).toBe(
      "The last scan didn't finish (1 Oct 2026, 06:04). There are no results yet. Try Scan now again.",
    );
  });

  it("answers what happened and what to do for each Scan now outcome", () => {
    expect(SCAN_NOW.queued).toBe("Scan queued. It starts shortly.");
    expect(SCAN_NOW.already).toBe("A scan is already waiting to run.");
    expect(SCAN_NOW.failed).toBe(
      "Harbour couldn't start the scan. Nothing changed, so try again in a moment.",
    );
  });
});
