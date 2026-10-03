// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { SYNC_UNCHECKED } from "@/lib/explain/brain-sync";
import { BrainSyncBanner } from "./BrainSyncBanner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("BrainSyncBanner", () => {
  it("promises to save notes soon, and says when saving is paused", () => {
    render(<BrainSyncBanner unsaved={2} unpushed={0} />);
    expect(screen.getByText("2 note files will be saved automatically soon")).toBeInTheDocument();
  });

  it("says saving resumes once recovery finishes", () => {
    render(<BrainSyncBanner unsaved={1} unpushed={0} paused />);
    expect(
      screen.getByText("1 note file not saved yet — saving resumes once recovery finishes"),
    ).toBeInTheDocument();
  });

  it("says how many saved changes are waiting to reach GitHub", () => {
    render(<BrainSyncBanner unsaved={0} unpushed={2} />);
    expect(
      screen.getByText("2 saved changes are waiting to reach GitHub — Harbour keeps retrying"),
    ).toBeInTheDocument();
  });

  it("says it couldn't check, instead of synced, when the unpushed count is unknown", () => {
    render(<BrainSyncBanner unsaved={0} unpushed={null} />);
    expect(screen.getByText(SYNC_UNCHECKED)).toBeInTheDocument();
    expect(screen.queryByText(/synced/)).not.toBeInTheDocument();
  });

  it("says Saved · synced, unless the page's verdict already says it", () => {
    const { container, rerender } = render(<BrainSyncBanner unsaved={0} unpushed={0} />);
    expect(screen.getByText("Saved · synced")).toBeInTheDocument();
    rerender(<BrainSyncBanner unsaved={0} unpushed={0} quietWhenSynced />);
    expect(container).toBeEmptyDOMElement();
    rerender(<BrainSyncBanner unsaved={0} unpushed={2} quietWhenSynced />);
    expect(screen.getByText(/waiting to reach GitHub/)).toBeInTheDocument();
  });
});
