import { activeScanSentence, lastScanSentence, NEVER_SCANNED, SCAN_NOW } from "./scan-status";

describe("scan status sentences", () => {
  it("says what happens for a site that was never scanned", () => {
    expect(NEVER_SCANNED).toMatch(/hasn't scanned this site yet.*Scan now.*scores appear/);
  });

  it("says a scan is running or waiting, and that the page updates", () => {
    expect(activeScanSentence("running", "1 Oct 2026, 06:04")).toBe(
      "Scanning now (started 1 Oct 2026, 06:04); this page updates when it finishes.",
    );
    expect(activeScanSentence("queued", "x")).toBe(
      "A scan is waiting to start; this page updates when it finishes.",
    );
  });

  it("says how the last scan ended and what to do", () => {
    const when = "1 Oct 2026, 06:04";
    expect(lastScanSentence({ status: "ok", when, showing: null })).toBe(
      "Last scan 1 Oct 2026, 06:04.",
    );
    expect(lastScanSentence({ status: "partial", when, showing: null })).toBe(
      "Last scan 1 Oct 2026, 06:04 had a data source problem, so some scores may be missing. Try Scan now.",
    );
    expect(lastScanSentence({ status: "failed", when, showing: "30 Sept 2026, 06:00" })).toBe(
      "The last scan didn't finish, so you're seeing the 30 Sept 2026, 06:00 results. Try Scan now.",
    );
    expect(lastScanSentence({ status: "failed", when, showing: null })).toBe(
      "The last scan didn't finish and there are no results yet. Try Scan now.",
    );
  });

  it("answers what happened and what to do for each Scan now outcome", () => {
    expect(SCAN_NOW.queued).toBe("Scan queued. It starts shortly.");
    expect(SCAN_NOW.already).toBe("A scan is already waiting to run.");
    expect(SCAN_NOW.failed).toBe("Harbour couldn't start the scan. Try again in a moment.");
  });
});
