// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { type LightTone, TONE_WORDS } from "@/lib/explain/tower";
import { LightMark, StatusLight } from "./StatusLight";

const TONES = Object.keys(TONE_WORDS) as LightTone[];

describe("StatusLight", () => {
  it.each(TONES)("shows the %s tone in words beside a hidden mark", (tone) => {
    const { container } = render(<StatusLight tone={tone} label="Worker" />);
    expect(screen.getByText("Worker")).toBeVisible();
    expect(screen.getByText(TONE_WORDS[tone])).toBeVisible();
    const mark = container.querySelector("svg");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("data-tone", tone);
  });

  it("gives every tone its own shape, so colour is never the only sign", () => {
    const shapes = TONES.map((tone) => {
      const { container, unmount } = render(<LightMark tone={tone} />);
      const html = container.innerHTML.replace(/class="[^"]*"/g, "");
      unmount();
      return html;
    });
    expect(new Set(shapes).size).toBe(TONES.length);
  });

  it("breathes only while busy", () => {
    const { container, rerender } = render(<LightMark tone="busy" />);
    expect(container.querySelector(".tower-breathe")).not.toBeNull();
    rerender(<LightMark tone="ok" />);
    expect(container.querySelector(".tower-breathe")).toBeNull();
  });

  it("in compact form shows only its label beside the mark", () => {
    render(<StatusLight tone="watch" label="Last checked 2 days ago." compact />);
    expect(screen.getByText("Last checked 2 days ago.")).toBeVisible();
    expect(screen.queryByText(TONE_WORDS.watch)).toBeNull();
  });
});
