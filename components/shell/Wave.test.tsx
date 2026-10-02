// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { WAVE_LAYERS, wavePath } from "@/design/wave";
import { Wave } from "./Wave";

describe("Wave", () => {
  it("is decorative: hidden from assistive tech, fixed, behind the content, and never takes a click", () => {
    const { container } = render(<Wave />);
    const wave = container.querySelector("[data-wave]");
    expect(wave).toHaveAttribute("aria-hidden", "true");
    expect(wave).toHaveClass("pointer-events-none", "fixed", "z-0");
    expect(wave?.textContent).toBe("");
  });

  it("is plain inline SVG: no script, canvas, image or foreign content", () => {
    const { container } = render(<Wave />);
    expect(container.querySelector("script, canvas, img, image, foreignObject, style")).toBeNull();
    expect(container.querySelectorAll("svg")).toHaveLength(WAVE_LAYERS.length);
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("draws exactly the layers the contrast test stacks, in the tide tint", () => {
    const { container } = render(<Wave />);
    const paths = [...container.querySelectorAll("path")];
    expect(paths.map((p) => Number(p.getAttribute("fill-opacity")))).toEqual(
      WAVE_LAYERS.map((l) => l.opacity),
    );
    expect(paths.map((p) => p.getAttribute("d"))).toEqual(WAVE_LAYERS.map((l) => wavePath(l)));
    for (const path of paths) expect(path).toHaveClass("fill-accent-soft");
  });

  it("marks only the front layer, for the celebrate ripple", () => {
    const { container } = render(<Wave />);
    const layers = [...container.querySelectorAll(".wave-layer")];
    expect(layers.filter((l) => l.hasAttribute("data-front"))).toEqual([layers.at(-1)]);
  });

  it("sits inside a box in the /design preview instead of fixed to the page", () => {
    const { container } = render(<Wave placement="preview" />);
    const wave = container.querySelector("[data-wave]");
    expect(wave).toHaveClass("absolute");
    expect(wave).not.toHaveClass("fixed");
  });
});
