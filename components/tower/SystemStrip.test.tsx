// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import {
  CALM_LIGHTS,
  SYSTEM_EXAMPLES,
  TROUBLED_LIGHTS,
} from "@/components/design/tower-example-data";
import { LIGHT_LABELS, TILE_FAILED, TONE_WORDS } from "@/lib/explain/tower";
import { SystemStrip } from "./SystemStrip";

const ok = (lights: typeof CALM_LIGHTS) => ({ ok: true as const, data: { lights, worst: null } });

describe("SystemStrip", () => {
  it("is a labelled section with eight lights in the fixed order, each in words", () => {
    render(<SystemStrip result={ok(CALM_LIGHTS)} />);
    const section = screen.getByRole("region", { name: "Systems" });
    expect(section).toHaveAttribute("id", "tower-systems");
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(8);
    expect(items.map((li) => li.textContent)).toEqual(
      CALM_LIGHTS.map((l) => `${LIGHT_LABELS[l.id]} ${TONE_WORDS[l.tone]}`),
    );
    expect(items[3]).toHaveTextContent("Checks working");
    expect(items[4]).toHaveTextContent("Backups switched off");
  });

  it("says all eight are fine only when every light is fine", () => {
    const fine = CALM_LIGHTS.map((l) => ({ ...l, tone: "ok" as const }));
    render(<SystemStrip result={ok(fine)} />);
    expect(screen.getByText("All eight are fine.")).toBeVisible();
  });

  it("names lights working now or switched off rather than calling them fine", () => {
    render(<SystemStrip result={ok(CALM_LIGHTS)} />);
    expect(screen.queryByText("All eight are fine.")).toBeNull();
    expect(
      screen.getByText("Nothing needs a look. Working now: Checks. Switched off: Backups."),
    ).toBeVisible();
  });

  it("lists the lights that are not fine, worst first, with their sentences", () => {
    render(<SystemStrip result={ok(TROUBLED_LIGHTS)} />);
    expect(screen.queryByText("All eight are fine.")).toBeNull();
    const sentences = screen.getAllByTestId("trouble").map((li) => li.textContent);
    expect(sentences).toEqual([
      "The worker isn't running, so checks, backups and agents are waiting.",
      "The last check for Acme Blog didn't finish.",
      "Weekly report: last ran on 21 Sept.",
      "Google Search Console had a problem in the last check.",
      "80% of this month's budget used.",
    ]);
    expect(screen.getByText(/1 more light needs a look/)).toBeVisible();
  });

  it("stops at five sentences and counts the rest", () => {
    const [, , many] = SYSTEM_EXAMPLES;
    render(<SystemStrip result={many?.result ?? ok(CALM_LIGHTS)} />);
    expect(screen.getAllByTestId("trouble")).toHaveLength(5);
    expect(screen.getByText(/2 more lights need a look/)).toBeVisible();
  });

  it("says it couldn't read the lights, in plain words, when its loader failed", () => {
    render(<SystemStrip result={{ ok: false, detail: "boom" }} />);
    expect(screen.getByRole("region", { name: "Systems" })).toBeInTheDocument();
    expect(screen.getByText(TILE_FAILED)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Worker/ })).toBeNull();
  });
});
