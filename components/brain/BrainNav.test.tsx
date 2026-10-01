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

  it("moves focus to the new document's heading after a tree link closes the panel", () => {
    navigation.pathname = "/brain/a.md";
    const page = (title: string) => (
      <main id="main" tabIndex={-1}>
        <BrainNav>
          <a href="/brain/b.md">b</a>
        </BrainNav>
        <article>
          <h1>{title}</h1>
        </article>
      </main>
    );
    const { rerender } = render(page("A"));
    fireEvent.click(screen.getByRole("button", { name: "Browse documents" }));
    screen.getByRole("link", { name: "b" }).focus();

    navigation.pathname = "/brain/b.md";
    rerender(page("B"));
    expect(screen.getByRole("heading", { name: "B" })).toHaveFocus();
  });

  it("leaves focus alone when the panel was closed", () => {
    navigation.pathname = "/brain/a.md";
    const { rerender } = render(
      <BrainNav>
        <p>tree</p>
      </BrainNav>,
    );
    const toggle = screen.getByRole("button", { name: "Browse documents" });
    toggle.focus();
    navigation.pathname = "/brain/b.md";
    rerender(
      <BrainNav>
        <p>tree</p>
      </BrainNav>,
    );
    expect(toggle).toHaveFocus();
  });
});
