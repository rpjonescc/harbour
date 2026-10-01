// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { BrainNav } from "./BrainNav";

const navigation = vi.hoisted(() => ({ pathname: "/brain/a.md" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

describe("BrainNav", () => {
  it("renders one tree and toggles it on small screens, closing after navigation", () => {
    const { rerender } = render(
      <BrainNav>
        <p>tree</p>
      </BrainNav>,
    );
    expect(screen.getAllByText("tree")).toHaveLength(1);
    const toggle = screen.getByRole("button", { name: "Browse documents" });
    const nav = screen.getByRole("navigation", { name: "Documents", hidden: true });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(nav).toHaveClass("hidden");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(nav).not.toHaveClass("hidden");

    navigation.pathname = "/brain/b.md";
    rerender(
      <BrainNav>
        <p>tree</p>
      </BrainNav>,
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
