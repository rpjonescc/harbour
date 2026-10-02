// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { EXAMPLE_BACKUPS, EXAMPLE_ZONE } from "@/components/design/ops-example-data";
import { CANT_OPEN_BACKUP_FOLDER } from "@/lib/explain/backups";
import { buildBriefing } from "@/lib/explain/briefing";
import { textOutsideDetails } from "@/tests/helpers/plain-text";
import { BackupNotice } from "../today/BackupNotice";
import { BackupCard } from "./BackupCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const zone = { timeZone: EXAMPLE_ZONE.timeZone, locale: "en-GB" };
const card = (health: keyof typeof EXAMPLE_BACKUPS, dirSet = false) =>
  render(
    <BackupCard backups={EXAMPLE_BACKUPS[health]} backupDirSet={dirSet} {...zone} section={{}} />,
  );

describe("BackupCard", () => {
  it("says it can't open the backup folder in the same words as Today and the briefing", () => {
    const { container, unmount } = card("unreadable");
    expect(container).toHaveTextContent(CANT_OPEN_BACKUP_FOLDER);
    expect(screen.getByText("Can't open the backup folder")).toBeInTheDocument();
    unmount();
    const notice = render(<BackupNotice backup={EXAMPLE_BACKUPS.unreadable} {...zone} />);
    expect(notice.container).toHaveTextContent(CANT_OPEN_BACKUP_FOLDER);
    const briefing = buildBriefing({
      products: [{ id: "acme-docs", name: "Acme Docs" }],
      scores: [],
      work: [],
      failures: [],
      failedChecks: [],
      backup: "unreadable",
    });
    expect(briefing.subLine).toContain(CANT_OPEN_BACKUP_FOLDER);
  });

  it("keeps the folder setting and raw error text inside Technical details", () => {
    const { container } = card("failed", true);
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_[A-Z_]+/);
    expect(screen.getByText(/The backup on .* didn't finish/)).toBeInTheDocument();
    expect(screen.getAllByText(/Technical details/).length).toBeGreaterThan(0);
  });

  it("has a purpose line and a labelled region", () => {
    card("ok");
    expect(screen.getByRole("region", { name: "Backups" })).toHaveAccessibleDescription(
      "Spare copies of Harbour's data, kept in case something goes wrong.",
    );
  });
});
