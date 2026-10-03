// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GLOSSARY } from "@/lib/explain/glossary";
import { Term } from "./Term";

function renderTerm(id: "indexed" | "worker" = "indexed", text = "in Google") {
  render(
    <p>
      Pages <Term id={id}>{text}</Term> today. <button type="button">Elsewhere</button>
    </p>,
  );
  const button = screen.getByRole("button", { name: text });
  const tip = screen.getByRole("tooltip", { hidden: true });
  return { button, tip };
}

const shown = (tip: HTMLElement) => !tip.hidden;

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches && query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Term", () => {
  it("is a button named by its words, described by a tooltip holding the meaning", () => {
    const { button, tip } = renderTerm();
    expect(button).toHaveAttribute("type", "button");
    expect(tip).toHaveAttribute("role", "tooltip");
    expect(button.getAttribute("aria-describedby")).toBe(tip.id);
    expect(tip).toHaveTextContent(GLOSSARY.indexed.meaning);
    expect(shown(tip)).toBe(false);
  });

  it("opens at once on focus and closes when focus leaves", () => {
    const { button, tip } = renderTerm();
    fireEvent.focus(button);
    expect(shown(tip)).toBe(true);
    fireEvent.blur(button, { relatedTarget: screen.getByRole("button", { name: "Elsewhere" }) });
    expect(shown(tip)).toBe(false);
  });

  it("opens 300 ms after hover, stays over the tip and closes 150 ms after leaving", () => {
    vi.useFakeTimers();
    const { button, tip } = renderTerm();
    const root = button.parentElement as HTMLElement;
    fireEvent.mouseEnter(root);
    act(() => vi.advanceTimersByTime(299));
    expect(shown(tip)).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(shown(tip)).toBe(true);
    // The tip sits inside the same root, so moving onto it never leaves.
    fireEvent.mouseOver(tip);
    act(() => vi.advanceTimersByTime(1000));
    expect(shown(tip)).toBe(true);
    fireEvent.mouseLeave(root);
    act(() => vi.advanceTimersByTime(149));
    expect(shown(tip)).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(shown(tip)).toBe(false);
  });

  it("does not open when the pointer leaves before 300 ms", () => {
    vi.useFakeTimers();
    const { button, tip } = renderTerm();
    const root = button.parentElement as HTMLElement;
    fireEvent.mouseEnter(root);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.mouseLeave(root);
    act(() => vi.advanceTimersByTime(1000));
    expect(shown(tip)).toBe(false);
  });

  it("toggles on click, and stays open after the pointer leaves", () => {
    vi.useFakeTimers();
    const { button, tip } = renderTerm();
    fireEvent.click(button);
    expect(shown(tip)).toBe(true);
    fireEvent.mouseLeave(button.parentElement as HTMLElement);
    act(() => vi.advanceTimersByTime(1000));
    expect(shown(tip)).toBe(true);
    fireEvent.click(button);
    expect(shown(tip)).toBe(false);
  });

  it("toggles with Enter and Space", () => {
    const { button, tip } = renderTerm();
    fireEvent.keyDown(button, { key: "Enter" });
    expect(shown(tip)).toBe(true);
    fireEvent.keyDown(button, { key: "Enter" });
    expect(shown(tip)).toBe(false);
    fireEvent.keyDown(button, { key: " " });
    fireEvent.keyUp(button, { key: " " });
    expect(shown(tip)).toBe(true);
    fireEvent.keyDown(button, { key: " " });
    fireEvent.keyUp(button, { key: " " });
    expect(shown(tip)).toBe(false);
  });

  it("closes on Escape and keeps focus on the word", () => {
    const { button, tip } = renderTerm();
    act(() => button.focus());
    expect(shown(tip)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(shown(tip)).toBe(false);
    expect(button).toHaveFocus();
  });

  it("closes on a click elsewhere", () => {
    const { button, tip } = renderTerm();
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(shown(tip)).toBe(false);
  });

  it("links to more when the glossary entry has it", () => {
    const { tip } = renderTerm("worker", "worker");
    expect(tip.querySelector("a")).toBeNull();
    cleanup();
    render(<Term id="backup">backup</Term>);
    const link = screen.getByRole("link", { name: GLOSSARY.backup.more?.label, hidden: true });
    expect(link).toHaveAttribute("href", GLOSSARY.backup.more?.href);
  });

  it("fades in unless reduced motion is asked for", () => {
    mockReducedMotion(false);
    const { tip } = renderTerm();
    expect(tip.className).toContain("term-tip-fade");
  });

  it("does not fade under reduced motion", () => {
    mockReducedMotion(true);
    const { tip } = renderTerm();
    expect(tip.className).not.toContain("term-tip-fade");
  });
});
