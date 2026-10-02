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
    expect(
      screen.getByText("This piece wasn't written. Discard this idea and write it again."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ideas this week come from your notes only. Screenpipe wasn't reachable."),
    ).toBeInTheDocument();
  });

  it("gives every example its own ids, and a stub offers Discard but never Try again", () => {
    const { container } = render(<ContentExamples />);
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = [...container.querySelectorAll("section[aria-label]")].map((e) =>
      e.getAttribute("aria-label"),
    );
    expect(new Set(labels).size).toBe(labels.length);
    const stub = screen.getByText(/Discard this idea and write it again/).closest("section");
    const names = [...(stub?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(names).toContain("Discard");
    expect(names).not.toContain("Try again");
    expect(names).not.toContain("Approve");
  });
});
