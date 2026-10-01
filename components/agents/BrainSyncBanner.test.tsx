// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { BrainSyncBanner } from "./BrainSyncBanner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("BrainSyncBanner", () => {
  it("promises to save notes once the brain is quiet, not on a fixed timer", () => {
    render(<BrainSyncBanner unsaved={2} unpushed={0} />);
    expect(
      screen.getByText(
        "2 note files will be saved automatically when the brain is quiet (before the next agent run at the latest)",
      ),
    ).toBeInTheDocument();
  });
});
