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
  it("says no paid data is connected and that nothing is being spent", () => {
    renderMeter({ state: "no-paid-sources", spentMicro: 0, unconfirmedMicro: 0 });
    expect(
      screen.getByText(
        "No paid data connected — Harbour is using free data only, so nothing is being spent.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/spent this month/)).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("still shows what was spent this month after a source was disconnected", () => {
    renderMeter({ state: "no-paid-sources", spentMicro: A$(1.23), unconfirmedMicro: 0 });
    expect(
      screen.getByText(/^No paid data connected · A\$1\.23 spent this month/),
    ).toBeInTheDocument();
  });

  it("says paid data is off until a budget is set, and links to how", () => {
    renderMeter({ state: "no-budget", spentMicro: 0, unconfirmedMicro: 0 });
    expect(
      screen.getByText(/^Paid data is off until you set a monthly budget/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /how to set one/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/#costs-and-budget$/),
    );
  });

  it("shows spend against the budget with the month-end projection", () => {
    renderMeter({
      state: "ok",
      spentMicro: A$(12.4),
      capMicro: A$(60),
      projectedMicro: A$(31),
      unconfirmedMicro: 0,
    });
    expect(
      screen.getByText("A$12.40 of A$60.00 this month · on track for A$31.00"),
    ).toBeInTheDocument();
    const meter = screen.getByRole("meter", { name: "Paid API spend this month" });
    expect(meter).toHaveAttribute("min", "0");
    expect(meter).toHaveAttribute("max", "60");
    expect(meter).toHaveAttribute("value", "12.4");
    expect(meter).toHaveAttribute("aria-valuetext", "A$12.40 of A$60.00");
    expect(screen.queryByText("80 % of budget")).toBeNull();
  });

  it("leaves the projection out until there is one", () => {
    renderMeter({
      state: "ok",
      spentMicro: A$(1),
      capMicro: A$(60),
      projectedMicro: null,
      unconfirmedMicro: 0,
    });
    expect(screen.getByText("A$1.00 of A$60.00 this month")).toBeInTheDocument();
  });

  it("tags 80 % of the budget as a warning", () => {
    renderMeter({
      state: "warn",
      spentMicro: A$(50),
      capMicro: A$(60),
      projectedMicro: A$(97),
      unconfirmedMicro: 0,
    });
    expect(screen.getByText("80 % of budget")).toBeInTheDocument();
    expect(screen.getByText(/A\$50\.00 of A\$60\.00 this month/)).toBeInTheDocument();
  });

  it("says when paid sources resume once the budget is reached, as a status", () => {
    renderMeter({
      state: "reached",
      spentMicro: A$(60.1),
      capMicro: A$(60),
      projectedMicro: null,
      unconfirmedMicro: 0,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Budget reached — paid data is paused until 1 Nov. Free checks carry on as normal.",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("meter", { name: "Paid API spend this month" })).toHaveAttribute(
      "value",
      "60",
    );
  });

  it("says how much of the spend is not yet confirmed", () => {
    renderMeter({
      state: "ok",
      spentMicro: A$(12.4),
      capMicro: A$(60),
      projectedMicro: null,
      unconfirmedMicro: A$(0.5),
    });
    expect(screen.getByText(/A\$0\.50 unconfirmed/)).toBeInTheDocument();
  });
});
