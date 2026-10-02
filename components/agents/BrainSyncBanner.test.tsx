// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
});
