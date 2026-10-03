// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { AgentRunExamples } from "./AgentRunExamples";
import { ProposalExamples } from "./ProposalExamples";
import { SettingsExamples } from "./SettingsExamples";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("proposal, agent run and settings examples", () => {
  it("shows every proposal status in plain words, and the empty list", () => {
    render(<ProposalExamples />);
    for (const word of ["Waiting for your OK", "Approved", "Rejected", "edited"]) {
      expect(screen.getAllByText(word).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Nothing to approve for Acme Docs yet/)).toBeInTheDocument();
    expect(screen.getAllByText("looking for you").length).toBeGreaterThan(0);
  });

  it("shows the run panel, run activity, sync and recovery states", () => {
    render(<AgentRunExamples />);
    expect(screen.getAllByRole("button", { name: "Find ideas for Acme Docs" }).length).toBe(2);
    expect(screen.getByText("Saved · synced")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agent run recovery" })).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Brain sync" }).length).toBe(2);
  });

  it("shows the theme toggle and the device list", () => {
    render(<SettingsExamples />);
    expect(screen.getByText("Example phone")).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(2);
  });
});
