// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { EXAMPLE_BACKUPS } from "@/components/design/ops-example-data";
import type { BackupStatus } from "@/lib/ops/backup-status";
import { BackupNotice } from "./BackupNotice";

const show = (backup: BackupStatus) =>
  render(<BackupNotice backup={backup} timeZone="Europe/London" locale="en-GB" />);

describe("BackupNotice", () => {
  it("names when the backup failed, its error, and the next try", () => {
    show(EXAMPLE_BACKUPS.failed);
    expect(screen.getByRole("status")).toHaveTextContent(
      "The backup on 2 Oct, 04:10 failed: No space left on device. Harbour tries again at Saturday 3 Oct, 03:15 — details in Settings.",
    );
    expect(screen.getByRole("link", { name: "details in Settings" })).toHaveAttribute(
      "href",
      "/settings#backups",
    );
  });

  it("points to Back up now when a manual backup failed with the schedule off", () => {
    show({ ...EXAMPLE_BACKUPS.failed, enabled: false, next: null });
    expect(screen.getByRole("status")).toHaveTextContent(
      "The backup on 2 Oct, 04:10 failed: No space left on device. Nightly backups are off — run Back up now in Settings.",
    );
    expect(screen.queryByText(/tries again/)).toBeNull();
    expect(screen.getByRole("link", { name: "Back up now in Settings" })).toHaveAttribute(
      "href",
      "/settings#backups",
    );
  });

  it("says when there has been no backup for two days", () => {
    show(EXAMPLE_BACKUPS.stale);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No backup in the last 2 days. Check that the worker is running — details in Settings.",
    );
  });

  it("says when the backup folder cannot be read", () => {
    show(EXAMPLE_BACKUPS.unreadable);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Harbour can't read the backup folder — check its permissions. Details in Settings.",
    );
    expect(screen.getByRole("link", { name: "Details in Settings" })).toHaveAttribute(
      "href",
      "/settings#backups",
    );
  });

  it.each(["ok", "none-yet", "off"] as const)("shows nothing when %s", (health) => {
    const { container } = show(EXAMPLE_BACKUPS[health]);
    expect(container).toBeEmptyDOMElement();
  });
});
