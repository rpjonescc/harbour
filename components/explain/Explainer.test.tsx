// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { AREA_ORDER, AREAS } from "@/lib/explain/areas";
import { Explainer } from "./Explainer";

const seo = AREAS.seo;
const BUTTON = "What's this? (Found on Google)";

function renderSeo(nextStep?: { href: string; label: string }) {
  render(
    <Explainer topic={seo.name} oneLiner={seo.oneLiner} parts={seo.parts} nextStep={nextStep} />,
  );
  return screen.getByRole("button", { name: BUTTON });
}

describe("Explainer", () => {
  it("always shows the one-liner and keeps the four parts closed", () => {
    const button = renderSeo();
    expect(screen.getByText(seo.oneLiner)).toBeVisible();
    expect(button).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();
  });

  it("opens and closes the four parts from the button", () => {
    const button = renderSeo();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    for (const label of [
      "What it is",
      "Why Harbour checks it",
      "What to do",
      "Why it's worth it",
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getByText(seo.parts.worth)).toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(seo.parts.worth)).not.toBeVisible();
  });

  it("is a real button, so it takes focus and Enter or Space work from the keyboard", () => {
    const button = renderSeo();
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    button.focus();
    expect(button).toHaveFocus();
  });

  it("links the next step inside the panel", () => {
    const button = renderSeo({
      href: "/actions?area=SEO",
      label: "See what's worth doing for Found on Google",
    });
    fireEvent.click(button);
    expect(
      screen.getByRole("link", { name: "See what's worth doing for Found on Google" }),
    ).toHaveAttribute("href", "/actions?area=SEO");
  });

  it("gives each explainer on a page its own button name", () => {
    render(
      <>
        {AREA_ORDER.map((key) => (
          <Explainer
            key={key}
            topic={AREAS[key].name}
            oneLiner={AREAS[key].oneLiner}
            parts={AREAS[key].parts}
          />
        ))}
      </>,
    );
    const names = screen.getAllByRole("button").map((button) => button.textContent);
    expect(new Set(names).size).toBe(3);
  });
});
