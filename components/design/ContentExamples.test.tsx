// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ContentExamples } from "./ContentExamples";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ContentExamples", () => {
  it("shows each state of the Content components", () => {
    render(<ContentExamples />);
    expect(screen.getByText("Idea card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Post 2" })).toBeInTheDocument();
    expect(screen.getByText("Check before posting: 1 pricing claim")).toBeInTheDocument();
    expect(screen.getByText("This piece wasn't written")).toBeInTheDocument();
    expect(
      screen.getByText("Ideas this week come from your notes only. Screenpipe wasn't reachable."),
    ).toBeInTheDocument();
  });
});
