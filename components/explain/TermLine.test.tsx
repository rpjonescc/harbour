// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { GLOSSARY } from "@/lib/explain/glossary";
import { termLineText } from "@/lib/explain/term-line";
import { TermLine } from "./TermLine";

const LINE = ["Saved to your ", { term: "second-brain", text: "Second Brain" }, "."] as const;

describe("TermLine", () => {
  it("renders the sentence with each glossary word as a term with its meaning", () => {
    const { container } = render(
      <p>
        <TermLine line={LINE} />
      </p>,
    );
    expect(container.textContent).toMatch(/^Saved to your Second Brain/);
    expect(container.textContent).toMatch(/\.$/);
    const word = screen.getByRole("button", { name: "Second Brain" });
    expect(word).toHaveAccessibleDescription(GLOSSARY["second-brain"].meaning);
  });

  it("reads as plain text without the tips", () => {
    expect(termLineText(LINE)).toBe("Saved to your Second Brain.");
  });
});
