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
import { SETTINGS_INTRO, SETTINGS_PURPOSE } from "@/lib/explain/settings";
import { settingsView } from "@/lib/settings/view";
import { openTestDb } from "@/tests/helpers/db";
import { textOutsideDetails } from "@/tests/helpers/plain-text";
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
      "Connections",
      "Budget",
      "Backups",
      "More settings",
    ]) {
      expect(section(name)).toBeInTheDocument();
    }
    expect(section("Backups")).toHaveAttribute("id", "backups");
  });

  it("opens with a headline and one plain line, files and settings under Technical details", () => {
    const { container } = renderView();
    expect(screen.getByText(SETTINGS_INTRO.line)).toBeInTheDocument();
    // The header only: the Schedules and Connections tables are rewritten in the next task.
    const header = container.querySelector("header") as HTMLElement;
    expect(textOutsideDetails(header)).not.toMatch(/HARBOUR_[A-Z_]+|\.env|harbour\.config/);
    const details = screen.getByText(/where settings live/).closest("details");
    expect(details).toHaveTextContent(SETTINGS_INTRO.files);
    expect(screen.getByRole("link", { name: /Configuration/ })).toHaveAttribute(
      "href",
      expect.stringContaining("#configuration"),
    );
  });

  it("gives every section its purpose line as its description", () => {
    renderView();
    const names = {
      Products: "products",
      Schedules: "schedules",
      Connections: "connections",
      Budget: "budget",
      Backups: "backups",
      "More settings": "more",
    } as const;
    for (const [name, key] of Object.entries(names)) {
      expect(section(name)).toHaveAccessibleDescription(SETTINGS_PURPOSE[key]);
    }
  });

  it("lists products with their Search Console property and approvals link", () => {
    renderView();
    const products = within(section("Products"));
    expect(products.getByText(/^Search Console site:/)).toHaveTextContent(
      "Search Console site: sc-domain:example.com",
    );
    expect(products.getByText("Search Console: not set up for this site yet")).toBeInTheDocument();
    expect(
      products.getByRole("link", { name: "3 research targets waiting for your OK for Acme Docs" }),
    ).toHaveAttribute("href", "/settings/products/acme-docs");
    expect(screen.queryByText(/example sites, not yours yet/)).toBeNull();
  });

  it("shows the demo-config notice when the example config is loaded", () => {
    renderView({ ...EXAMPLE_SETTINGS, isDemoConfig: true });
    expect(
      within(section("Products")).getByText(/example sites, not yours yet/),
    ).toBeInTheDocument();
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
    const keys = within(section("Connections"));
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
    expect(budget.getByText("A$60.00 a month")).toBeInTheDocument();
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
    expect(within(section("Budget")).getByText("A$0.00 — paid data is switched off")).toBeVisible();
  });

  it("shows backup health, the last backup, retention and Back up now", () => {
    renderView();
    const backups = within(section("Backups"));
    expect(backups.getByText("Up to date")).toBeInTheDocument();
    expect(backups.getByText("2 Oct, 03:15 · 12.4 MB")).toBeInTheDocument();
    expect(backups.getByText("9 of 14")).toBeInTheDocument();
    expect(backups.getByText("A backups folder next to the database")).toBeInTheDocument();
    expect(backups.getByText(/Removed 18,240 observations from 11 checks/)).toBeInTheDocument();
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
      backups.getByText("Harbour can't open the backup folder — check its permissions"),
    ).toBeInTheDocument();
    expect(backups.queryByText(/ of 14$/)).toBeNull();
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
