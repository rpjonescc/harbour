// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { crestPath, WAVE_LAYERS, wavePath } from "@/design/wave";
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

  it("draws exactly the layers the contrast test checks, each in its ocean token", () => {
    const { container } = render(<Wave />);
    const paths = [...container.querySelectorAll("path:not(.wave-crest)")] as SVGElement[];
    expect(paths.map((p) => p.getAttribute("d"))).toEqual(WAVE_LAYERS.map((l) => wavePath(l)));
    expect(paths.map((p) => p.style.fill)).toEqual(WAVE_LAYERS.map((l) => `var(--${l.token})`));
  });

  it("edges each layer with a thin foam line in the crest token, never filled", () => {
    const { container } = render(<Wave />);
    const crests = [...container.querySelectorAll(".wave-crest")] as SVGElement[];
    expect(crests.map((c) => c.getAttribute("d"))).toEqual(WAVE_LAYERS.map((l) => crestPath(l)));
    for (const crest of crests) {
      expect(crest).toHaveAttribute("fill", "none");
      expect(crest.style.stroke).toBe("var(--ocean-crest)");
    }
  });

  it("starts each layer at its own point in its drift and bob, so the crests never line up", () => {
    const { container } = render(<Wave />);
    const delays = [...container.querySelectorAll<SVGElement>(".wave-drift")].map((svg) =>
      svg.style.getPropertyValue("--wave-delay"),
    );
    expect(new Set(delays).size).toBe(WAVE_LAYERS.length);
  });

  it("has nothing to focus or announce: no role, no tab stop, no text", () => {
    const { container } = render(<Wave />);
    const wave = container.querySelector("[data-wave]");
    expect(wave?.querySelector("[role], [tabindex], a, button, title, desc")).toBeNull();
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("focusable", "false");
    }
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
