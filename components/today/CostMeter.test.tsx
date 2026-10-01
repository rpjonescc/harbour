// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MICRO_PER_AUD } from "@/lib/costs/budget";
import type { CostMeterView } from "@/lib/costs/meter-view";
import { CostMeter } from "./CostMeter";

const A$ = (aud: number) => Math.round(aud * MICRO_PER_AUD);
const NOW = new Date("2026-10-16T09:00:00Z");
const renderMeter = (view: CostMeterView) =>
  render(<CostMeter view={view} now={NOW} timeZone="Europe/London" locale="en-GB" />);

describe("CostMeter", () => {
  it("says no paid source is connected, without a spend line when nothing was spent", () => {
    renderMeter({ state: "no-paid-sources", spentMicro: 0 });
    expect(screen.getByText("No paid sources connected")).toBeInTheDocument();
    expect(screen.queryByText(/spent this month/)).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("still shows what was spent this month after a source was disconnected", () => {
    renderMeter({ state: "no-paid-sources", spentMicro: A$(1.23) });
    expect(screen.getByText(/A\$1\.23 spent this month/)).toBeInTheDocument();
  });

  it("says paid sources are off and links to the budget docs when no budget is set", () => {
    renderMeter({ state: "no-budget", spentMicro: 0 });
    expect(screen.getByText(/Paid sources are off:/)).toHaveTextContent(
      "Paid sources are off: no monthly budget set",
    );
    expect(screen.getByRole("link", { name: /no monthly budget set/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/#costs-and-budget$/),
    );
  });

  it("shows spend against the budget with the month-end projection", () => {
    renderMeter({ state: "ok", spentMicro: A$(12.4), capMicro: A$(60), projectedMicro: A$(31) });
    expect(
      screen.getByText("A$12.40 of A$60.00 this month · on track for A$31.00"),
    ).toBeInTheDocument();
    const meter = screen.getByRole("meter", { name: "Paid API spend this month" });
    expect(meter).toHaveAttribute("value", String(A$(12.4)));
    expect(meter).toHaveAttribute("max", String(A$(60)));
    expect(screen.queryByText("80 % of budget")).toBeNull();
  });

  it("leaves the projection out until there is one", () => {
    renderMeter({ state: "ok", spentMicro: A$(1), capMicro: A$(60), projectedMicro: null });
    expect(screen.getByText("A$1.00 of A$60.00 this month")).toBeInTheDocument();
  });

  it("tags 80 % of the budget as a warning", () => {
    renderMeter({ state: "warn", spentMicro: A$(50), capMicro: A$(60), projectedMicro: A$(97) });
    expect(screen.getByText("80 % of budget")).toBeInTheDocument();
    expect(screen.getByText(/A\$50\.00 of A\$60\.00 this month/)).toBeInTheDocument();
  });

  it("says when paid sources resume once the budget is reached, as a status", () => {
    renderMeter({ state: "reached", spentMicro: A$(60.1), capMicro: A$(60), projectedMicro: null });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Budget reached — paid sources are paused until 1 Nov",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("meter", { name: "Paid API spend this month" })).toHaveAttribute(
      "value",
      String(A$(60)),
    );
  });
});
