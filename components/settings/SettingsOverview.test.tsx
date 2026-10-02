// @vitest-environment jsdom
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import {
  EXAMPLE_BACKUPS,
  EXAMPLE_SETTINGS,
  EXAMPLE_ZONE,
} from "@/components/design/ops-example-data";
import { parseConfig } from "@/lib/config";
import { settingsView } from "@/lib/settings/view";
import { openTestDb } from "@/tests/helpers/db";
import { SettingsOverview } from "./SettingsOverview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const renderView = (view = EXAMPLE_SETTINGS) =>
  render(<SettingsOverview view={view} now={EXAMPLE_ZONE.now} locale="en-GB" />);
const section = (name: string) => screen.getByRole("region", { name });

describe("SettingsOverview", () => {
  it("has a heading and a labelled region per section", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    for (const name of [
      "Products",
      "Schedules",
      "API keys",
      "Budget",
      "Backups",
      "More settings",
    ]) {
      expect(section(name)).toBeInTheDocument();
    }
    expect(section("Backups")).toHaveAttribute("id", "backups");
  });

  it("says where the values come from, with a link to the docs", () => {
    renderView();
    expect(screen.getByText(/Values come from/)).toHaveTextContent(
      "Values come from .env and harbour.config.json",
    );
    expect(screen.getByRole("link", { name: /Configuration/ })).toHaveAttribute(
      "href",
      expect.stringContaining("#configuration"),
    );
  });

  it("lists products with their Search Console property and approvals link", () => {
    renderView();
    const products = within(section("Products"));
    expect(products.getByText("sc-domain:example.com")).toBeInTheDocument();
    expect(products.getByText("No Search Console property")).toBeInTheDocument();
    expect(
      products.getByRole("link", { name: "3 research targets waiting for approval" }),
    ).toHaveAttribute("href", "/settings/products/acme-docs");
    expect(screen.queryByText(/Demo config/)).toBeNull();
  });

  it("shows the demo-config notice when the example config is loaded", () => {
    renderView({ ...EXAMPLE_SETTINGS, isDemoConfig: true });
    expect(within(section("Products")).getByText(/Demo config/)).toBeInTheDocument();
  });

  it("shows each schedule's next run, or how it was turned off", () => {
    renderView();
    const schedules = within(section("Schedules"));
    expect(schedules.getByRole("row", { name: /Weekly analyst/ })).toHaveTextContent(
      "Sunday 4 Oct, 20:00",
    );
    expect(schedules.getByRole("row", { name: /Monthly research refresh/ })).toHaveTextContent(
      "Off — HARBOUR_SCHEDULED_RESEARCH=off",
    );
    expect(schedules.getByRole("row", { name: /Morning note/ })).toHaveTextContent(
      "Off — HARBOUR_PERSONALITY=quiet",
    );
    expect(schedules.getByText(/Europe\/London/)).toBeInTheDocument();
  });

  it("shows key status by name, with the setting and a not-used-yet tag", () => {
    renderView();
    const keys = within(section("API keys"));
    expect(keys.getByRole("row", { name: /Claude token/ })).toHaveTextContent("Present");
    expect(keys.getByRole("row", { name: /Search Console/ })).toHaveTextContent("File not found");
    const openai = keys.getByRole("row", { name: /OpenAI/ });
    expect(openai).toHaveTextContent("Missing");
    expect(openai).toHaveTextContent("not used yet");
    expect(openai).toHaveTextContent("HARBOUR_OPENAI_API_KEY");
  });

  it("shows the budget, spend and unconfirmed reservations read-only", () => {
    renderView();
    const budget = within(section("Budget"));
    expect(budget.getByText("A$60.00")).toBeInTheDocument();
    expect(budget.getByRole("row", { name: /rankings/ })).toHaveTextContent("A$0.50");
    expect(budget.getByRole("link", { name: "Job 38" })).toHaveAttribute("href", "/agents/38");
    expect(budget.queryByRole("button")).toBeNull();
  });

  it("says when no paid calls are allowed", () => {
    renderView({
      ...EXAMPLE_SETTINGS,
      budget: { state: "no-paid-sources", spentMicro: 0, unconfirmedMicro: 0, capMicro: 0 },
      reservations: [],
    });
    expect(within(section("Budget")).getByText("A$0.00 — no paid calls allowed")).toBeVisible();
  });

  it("shows backup health, the last backup, retention and Back up now", () => {
    renderView();
    const backups = within(section("Backups"));
    expect(backups.getByText("Healthy")).toBeInTheDocument();
    expect(backups.getByText("2 Oct, 03:15 · 12.4 MB")).toBeInTheDocument();
    expect(backups.getByText("9 of 14 kept")).toBeInTheDocument();
    expect(backups.getByText(/next to the database/)).toBeInTheDocument();
    expect(backups.getByText(/Removed 18,240 observations from 11 scans/)).toBeInTheDocument();
    expect(backups.getByRole("button", { name: "Back up now" })).toBeEnabled();
  });

  it("shows a failed backup's error and no backup yet", () => {
    const { unmount } = renderView({ ...EXAMPLE_SETTINGS, backups: EXAMPLE_BACKUPS.failed });
    expect(within(section("Backups")).getByText(/No space left on device/)).toBeInTheDocument();
    unmount();
    renderView({ ...EXAMPLE_SETTINGS, backups: EXAMPLE_BACKUPS["none-yet"] });
    expect(within(section("Backups")).getAllByText("No backup yet").length).toBeGreaterThan(0);
  });

  it("says when the backup folder cannot be read, with no count", () => {
    renderView({ ...EXAMPLE_SETTINGS, backups: EXAMPLE_BACKUPS.unreadable });
    const backups = within(section("Backups"));
    expect(
      backups.getByText("Harbour can't read the backup folder — check its permissions"),
    ).toBeInTheDocument();
    expect(backups.queryByText(/of 14 kept/)).toBeNull();
    expect(backups.queryByText("No backup yet")).toBeNull();
  });

  it("shows the budget cap once, leaving spend and projection to the meter", () => {
    renderView();
    const budget = within(section("Budget"));
    expect(budget.queryByText("Spent this month")).toBeNull();
    expect(budget.getByText(/A\$12\.40 of A\$60\.00 this month/)).toBeInTheDocument();
  });

  it("links to the other settings pages", () => {
    renderView();
    const more = within(section("More settings"));
    expect(more.getByRole("link", { name: "Sources" })).toHaveAttribute(
      "href",
      "/settings/sources",
    );
    expect(more.getByRole("link", { name: /Devices/ })).toHaveAttribute(
      "href",
      "/settings/devices",
    );
    expect(more.getByRole("link", { name: /Acme Blog/ })).toHaveAttribute(
      "href",
      "/settings/products/acme-blog",
    );
  });

  it("never renders a secret, built from a config full of sentinels", () => {
    const dir = mkdtempSync(join(tmpdir(), "harbour-settings-"));
    try {
      const config = parseConfig({
        HARBOUR_ALLOWED_LOGINS: "owner@example.com",
        HARBOUR_ORIGIN: "https://harbour.example.ts.net",
        HARBOUR_RP_ID: "harbour.example.ts.net",
        HARBOUR_BACKUP_DIR: join(dir, "SENTINEL-backups"),
        HARBOUR_CLAUDE_OAUTH_TOKEN: "SENTINEL-claude",
        HARBOUR_PAGESPEED_API_KEY: "SENTINEL-pagespeed",
        HARBOUR_GSC_CREDENTIALS: join(dir, "SENTINEL-gsc.json"),
        HARBOUR_DATAFORSEO_LOGIN: "SENTINEL-login",
        HARBOUR_DATAFORSEO_PASSWORD: "SENTINEL-password",
        HARBOUR_OPENAI_API_KEY: "SENTINEL-openai",
        HARBOUR_PERPLEXITY_API_KEY: "SENTINEL-perplexity",
        HARBOUR_GEMINI_API_KEY: "SENTINEL-gemini",
      });
      const products = [
        { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" },
      ] as const;
      const view = settingsView(openTestDb(), products, config, EXAMPLE_ZONE.now, false);
      const { container } = renderView(view);
      expect(container.innerHTML).not.toContain("SENTINEL");
      expect(container.innerHTML).not.toContain(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
