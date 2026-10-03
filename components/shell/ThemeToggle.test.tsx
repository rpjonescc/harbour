// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("cycles system → light → dark → night → system, naming the theme in words", () => {
    render(<ThemeToggle initial="system" />);
    const button = screen.getByRole("button", { name: "Theme: system" });
    for (const theme of ["light", "dark", "night", "system"]) {
      fireEvent.click(button);
      expect(button).toHaveTextContent(`Theme: ${theme}`);
      expect(document.documentElement.dataset.theme).toBe(theme);
    }
  });
});
