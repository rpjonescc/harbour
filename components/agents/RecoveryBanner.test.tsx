// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { RECOVERY_UNCHECKED } from "@/lib/explain/brain-sync";
import { RecoveryBanner } from "./RecoveryBanner";

describe("RecoveryBanner", () => {
  it("shows nothing when no run needs recovering", () => {
    const { container } = render(<RecoveryBanner pending={[]} lastError={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many runs were interrupted", () => {
    render(<RecoveryBanner pending={["3"]} lastError={null} />);
    expect(screen.getByText(/1 run was interrupted/)).toBeInTheDocument();
  });

  it("says plainly when Harbour could not check, instead of showing nothing", () => {
    render(<RecoveryBanner pending={null} lastError="Harbour couldn't check (EACCES)" />);
    expect(screen.getByText(RECOVERY_UNCHECKED)).toBeInTheDocument();
  });
});
