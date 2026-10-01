// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { EXAMPLE_BACKUPS } from "@/components/design/ops-example-data";
import { BackupNotice } from "./BackupNotice";

describe("BackupNotice", () => {
  it("says the last backup failed, with its error and a link to Settings", () => {
    render(<BackupNotice backup={EXAMPLE_BACKUPS.failed} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Last night's backup failed: No space left on device. Harbour tries again at 03:15 — details in Settings.",
    );
    expect(screen.getByRole("link", { name: "details in Settings" })).toHaveAttribute(
      "href",
      "/settings#backups",
    );
  });

  it("says when there has been no backup for two days", () => {
    render(<BackupNotice backup={EXAMPLE_BACKUPS.stale} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No backup in the last 2 days. Check that the worker is running — details in Settings.",
    );
  });

  it.each(["ok", "none-yet", "off"] as const)("shows nothing when %s", (health) => {
    const { container } = render(<BackupNotice backup={EXAMPLE_BACKUPS[health]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
