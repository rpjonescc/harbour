// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { EXAMPLE_BACKUPS } from "@/components/design/ops-example-data";
import type { BackupStatus } from "@/lib/ops/backup-status";
import { BackupNotice } from "./BackupNotice";

const show = (backup: BackupStatus) =>
  render(<BackupNotice backup={backup} timeZone="Europe/London" locale="en-GB" />);

describe("BackupNotice", () => {
  it("says the backup didn't finish, that live data is fine, and when Harbour tries again", () => {
    show(EXAMPLE_BACKUPS.failed);
    expect(screen.getByRole("status")).toHaveTextContent(
      "The backup on 2 Oct, 04:10 didn't finish. Your live data is fine, but your newest spare copy is older than it should be. Harbour tries again at Saturday 3 Oct, 03:15 — details in Settings.",
    );
    expect(screen.getByRole("link", { name: "details in Settings" })).toHaveAttribute(
      "href",
      "/settings#backups",
    );
    expect(screen.getByText("No space left on device")).not.toBeVisible();
  });

  it("points to Back up now when nightly backups are off", () => {
    show({ ...EXAMPLE_BACKUPS.failed, enabled: false, next: null });
    expect(screen.getByRole("status")).toHaveTextContent(
      "The backup on 2 Oct, 04:10 didn't finish. Your live data is fine, but your newest spare copy is older than it should be. Nightly backups are off, so run Back up now in Settings.",
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
      "No backup in the last 2 days. Your live data is fine, but there's no recent spare copy. Check that Harbour's background worker is running — details in Settings.",
    );
  });

  it("says when the backup folder can't be opened", () => {
    show(EXAMPLE_BACKUPS.unreadable);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Harbour can't open the backup folder, so it can't check your spare copies. Check the folder's permissions — details in Settings.",
    );
  });

  it.each(["ok", "none-yet", "off"] as const)("shows nothing when %s", (health) => {
    const { container } = show(EXAMPLE_BACKUPS[health]);
    expect(container).toBeEmptyDOMElement();
  });
});
