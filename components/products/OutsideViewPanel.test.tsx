// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { OUTSIDE_READY, OUTSIDE_STATES } from "@/components/design/outside-example-data";
import type { OutsideView } from "@/lib/scan/outside-view";
import { OutsideViewPanel } from "./OutsideViewPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const draw = (view: OutsideView) =>
  render(<OutsideViewPanel view={view} productId="acme-docs" locale="en-GB" />);
const state = (label: string) => {
  const found = OUTSIDE_STATES.find((s) => s.label === label);
  if (!found) throw new Error(`no state ${label}`);
  return found.view;
};
const region = () => screen.getByRole("region", { name: "How the web sees you" });

describe("OutsideViewPanel: with results", () => {
  it("leads with the links, then each search, then the AI check, then the date", () => {
    draw(OUTSIDE_READY);
    const text = region().textContent ?? "";
    expect(text).toContain("4 sites link to you");
    expect(text).toContain("Up 1 since the last check");
    expect(text).toContain(
      "ChatGPT named you in 1 of 5 answers; sites it cited most: news.example.org, reviews.example.net.",
    );
    expect(text).toContain("Last checked 4 Oct 2026.");
  });

  it("says each position in words and how it moved, never inventing one", () => {
    draw(OUTSIDE_READY);
    const rows = within(region())
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(rows).toContain("acme docsPosition 3 · Up from position 5");
    expect(rows).toContain(
      "best documentation tools for small teamsNot in the top 30 · Same as last time",
    );
    expect(rows).toContain("docs for remote teamsPosition 12 · Down from not in the top 30");
    expect(rows).toContain("team handbook softwarePosition 7 · First check");
    expect(rows).toContain("documentation hostingNot checked yet");
    expect(region().textContent).not.toMatch(/Position (0|31)\b/);
  });

  it("puts no links and no raw codes in what is always visible", () => {
    draw(OUTSIDE_READY);
    expect(within(region()).queryAllByRole("link")).toEqual([]);
    expect(region().textContent).not.toMatch(/GEO|backlink|SERP|citation|scan/i);
  });

  it("keeps the evidence under Technical details, as plain text", () => {
    draw(OUTSIDE_READY);
    expect(screen.getByText(/Technical details/)).toBeInTheDocument();
    expect(region().querySelectorAll("a")).toHaveLength(0);
  });

  it("shows hostile stored text as text, not markup", () => {
    const hostile = '<img src=x onerror="alert(1)"> and <b>bold</b>';
    const view: OutsideView = {
      ...OUTSIDE_READY,
      searches: [
        {
          ...(OUTSIDE_READY.searches[0] as OutsideView["searches"][number]),
          query: hostile,
          url: "javascript:alert(1)",
        },
      ],
      ai: {
        ...(OUTSIDE_READY.ai as NonNullable<OutsideView["ai"]>),
        domains: ["<script>x</script>.example"],
      },
    };
    const { container } = draw(view);
    expect(container.querySelector("img, script, b")).toBeNull();
    expect(region().textContent).toContain(hostile);
    expect(region().textContent).toContain("<script>x</script>.example");
  });

  it("says a missing links check, not 0 sites", () => {
    draw({ ...OUTSIDE_READY, links: null });
    expect(region().textContent).toContain("Links to you: not checked yet");
    expect(region().textContent).not.toMatch(/\b0 sites/);
  });

  it("says the AI check hasn't been made rather than 0 of 0", () => {
    draw({ ...OUTSIDE_READY, ai: null });
    expect(region().textContent).not.toContain("0 of 0");
    expect(region().textContent).toContain("Not checked yet");
  });

  it("pluralises one site and one answer", () => {
    draw({
      ...OUTSIDE_READY,
      links: { count: 1, change: -1, checkedAt: "2026-10-04T06:00:00.000Z" },
      ai: { asked: 1, named: 1, cited: 0, domains: [], checkedAt: "2026-10-04T06:00:00.000Z" },
    });
    expect(region().textContent).toContain("1 site links to you");
    expect(region().textContent).toContain("Down 1 since the last check");
    expect(region().textContent).toContain("ChatGPT named you in 1 of 1 answer.");
  });
});

describe("OutsideViewPanel: notices and empty states", () => {
  it.each([
    ["Paused after a refused key", "Paused: balance or key"],
    ["Paused: balance empty", "Paused: balance or key"],
    ["Skipped: budget used up", "Skipped: this month's budget is used up"],
    ["The last check didn't work", "The last check didn't work"],
  ])("shows the data and the notice for %s", (label, words) => {
    draw(state(label));
    expect(region().textContent).toContain(words);
    expect(region().textContent).toContain("4 sites link to you");
  });

  it.each([
    ["No searches chosen", "No searches chosen yet"],
    ["Treg isn't connected", "Treg isn't connected"],
    ["Not checked yet", "Not checked yet."],
    ["Not checked: paused", "Paused: balance or key"],
    ["Not checked: budget used up", "Skipped: this month's budget is used up"],
  ])("says %s and shows no numbers", (label, words) => {
    draw(state(label));
    expect(region().textContent).toContain(words);
    expect(region().textContent).not.toMatch(/\b\d+ sites? link|Position \d/);
  });

  it("offers the button only once searches are chosen and Treg is connected", () => {
    draw(state("No searches chosen"));
    expect(screen.queryByRole("button", { name: "Run this check now" })).toBeNull();
  });

  it("disables the button while a check runs", () => {
    draw(state("A check is running"));
    expect(screen.getByRole("button", { name: "Run this check now" })).toBeDisabled();
  });

  it("explains itself in one visible sentence, with the rest behind What's this?", () => {
    draw(OUTSIDE_READY);
    expect(screen.getByRole("button", { name: /What's this\?/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
