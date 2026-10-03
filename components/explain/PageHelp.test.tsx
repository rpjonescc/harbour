// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { GLOSSARY } from "@/lib/explain/glossary";
import { PAGE_HELP } from "@/lib/explain/page-help";
import { PageHelp } from "./PageHelp";

const NAME = "What's this page?";

function renderHelp(page: "product" | "devices" = "product") {
  render(
    <div>
      <input aria-label="Search" />
      <textarea aria-label="Notes" />
      <div contentEditable suppressContentEditableWarning data-testid="editable" />
      <PageHelp page={page} />
      <button type="button">Elsewhere</button>
    </div>,
  );
  const button = screen.getByRole("button", { name: NAME });
  const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
  if (!panel) throw new Error("the button controls no panel");
  return { button, panel };
}

describe("PageHelp", () => {
  it("is a closed disclosure that names its shortcut", () => {
    const { button, panel } = renderHelp();
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-keyshortcuts", "?");
    expect(panel).not.toBeVisible();
  });

  it("opens and closes from the button", () => {
    const { button, panel } = renderHelp();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
    fireEvent.click(button);
    expect(panel).not.toBeVisible();
  });

  it("shows the purpose, the reading order, the first step and the page's words", () => {
    const { button, panel } = renderHelp();
    fireEvent.click(button);
    const copy = PAGE_HELP.product;
    expect(panel).toHaveTextContent(copy.purpose);
    expect(panel).toHaveTextContent(copy.firstStep);
    const steps = panel.querySelectorAll("ol > li");
    expect([...steps].map((li) => li.textContent)).toEqual([...copy.howToRead]);
    for (const id of copy.terms) {
      expect(panel).toHaveTextContent(GLOSSARY[id].word);
      expect(panel).toHaveTextContent(GLOSSARY[id].meaning);
    }
  });

  it("leaves out the words section on a page with no special words", () => {
    const { button, panel } = renderHelp("devices");
    fireEvent.click(button);
    expect(panel).not.toHaveTextContent("Words on this page");
  });

  it("opens on ?, but not while typing in a field", () => {
    const { panel } = renderHelp();
    for (const field of [
      screen.getByRole("textbox", { name: "Search" }),
      screen.getByRole("textbox", { name: "Notes" }),
      screen.getByTestId("editable"),
    ]) {
      fireEvent.keyDown(field, { key: "?" });
      expect(panel).not.toBeVisible();
    }
    fireEvent.keyDown(document.body, { key: "?", ctrlKey: true });
    expect(panel).not.toBeVisible();
    fireEvent.keyDown(document.body, { key: "?" });
    expect(panel).toBeVisible();
  });

  it("opens only the first on a page that shows more than one", () => {
    render(
      <>
        <PageHelp page="design" />
        <PageHelp page="tower" />
      </>,
    );
    const [first, second] = screen.getAllByRole("button", { name: NAME });
    fireEvent.keyDown(document.body, { key: "?" });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and returns focus to the button", () => {
    const { button, panel } = renderHelp();
    fireEvent.keyDown(document.body, { key: "?" });
    expect(panel).toBeVisible();
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus());
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(panel).not.toBeVisible();
    expect(button).toHaveFocus();
  });

  it("closes on a click outside, and stays open for a click inside", () => {
    const { button, panel } = renderHelp();
    fireEvent.click(button);
    fireEvent.pointerDown(panel);
    expect(panel).toBeVisible();
    fireEvent.pointerDown(document.body);
    expect(panel).not.toBeVisible();
  });
});
