// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { OpsExamples } from "./OpsExamples";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("OpsExamples", () => {
  it("gives each example Back up now button its own accessible name", () => {
    render(<OpsExamples />);
    const names = screen
      .getAllByRole("button", { name: /Back up now/ })
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives each example's Technical details its own name", () => {
    const { container } = render(<OpsExamples />);
    const names = [...container.querySelectorAll("summary")].map((el) => el.textContent);
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
  });

  it("nests the Settings card headings under the design page's section heading", () => {
    render(<OpsExamples />);
    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([]);
    expect(screen.getAllByRole("heading", { level: 3, name: "Backups" }).length).toBe(6);
  });
});
