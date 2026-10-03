// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { ScoreBreakdown } from "./ScoreBreakdown";

const entry = (over: Partial<ScoreBreakdownEntry>): ScoreBreakdownEntry => ({
  key: "seo.technical",
  label: "Technical health",
  score: 80,
  weight: 0.35,
  evidence: "6 pages crawled, 6 answered 2xx.",
  status: "ok",
  ...over,
});
const entries = [
  entry({}),
  entry({
    key: "seo.indexability",
    label: "Indexability",
    score: 35,
    weight: 0.25,
    evidence: "Googlebot allowed; No sitemap found",
  }),
  entry({
    key: "seo.cwv",
    label: "Core Web Vitals",
    score: null,
    weight: 0.2,
    evidence: "PageSpeed is not connected",
    status: "missing",
  }),
];

describe("ScoreBreakdown", () => {
  it("lists sub-scores weakest first, with the not-counted one last", () => {
    render(<ScoreBreakdown area="seo" entries={entries} complete={false} />);
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Google can get in", "Page health", "Speed on phones"]);
  });

  it("says each one as a plain sentence with its verdict, and why a missing one is not counted", () => {
    render(<ScoreBreakdown area="seo" entries={entries} complete={false} />);
    expect(
      screen.getByText("Google is allowed in, but your sitemap is missing or broken."),
    ).toBeInTheDocument();
    expect(screen.getByText("Not counted yet")).toBeInTheDocument();
    expect(screen.getByText("Not connected yet, so it isn't counted.")).toBeInTheDocument();
    expect(screen.getByText(/Parts marked/)).toBeInTheDocument();
  });

  it("gives each sub-score its own explainer button", () => {
    render(<ScoreBreakdown area="seo" entries={entries} complete />);
    const button = screen.getByRole("button", { name: /What's this\? \(Page health\)/ });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: /What's this\?/ })).toHaveLength(3);
  });

  it("keeps codes, weights and raw evidence inside Technical details", () => {
    render(<ScoreBreakdown area="seo" entries={entries} complete />);
    const details = screen.getByText(/Technical details/).closest("details") as HTMLElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("seo.technical")).toBeInTheDocument();
    expect(within(details).getByText("35%")).toBeInTheDocument();
    expect(within(details).getByText("PageSpeed is not connected")).toBeInTheDocument();
    const visible = document.createElement("div");
    visible.innerHTML = document.body.innerHTML;
    for (const d of visible.querySelectorAll("details")) d.remove();
    expect(visible.textContent).not.toMatch(/\b(?:seo|geo|aeo)\.[a-z]/i);
  });

  it("reads a sub-score the formula no longer has, or evidence it can't parse, as a plain sentence", () => {
    render(
      <ScoreBreakdown
        area="seo"
        complete
        entries={[
          entry({
            key: "seo.legacy",
            label: "Old measure",
            score: 75,
            evidence: "something older",
          }),
          entry({ key: "seo.technical", score: 55, evidence: "a wording from an older formula" }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Old measure" })).toBeInTheDocument();
    expect(screen.getByText("In good shape, with a little room to improve.")).toBeInTheDocument();
    expect(screen.getByText("Working, but there's clear room to improve.")).toBeInTheDocument();
  });

  it("says when there is no breakdown yet", () => {
    render(<ScoreBreakdown area="geo" entries={[]} complete />);
    expect(screen.getByText(/The details behind Recommended by AI assistants/)).toBeInTheDocument();
  });

  it("tags a measured check of weight 0 Not counted, says why, and lists it after the rest", () => {
    const aeo = [
      entry({
        key: "aeo.qaCoverage",
        label: "FAQ, HowTo and Q&A coverage",
        score: 0,
        weight: 0,
        evidence:
          "0 of 5 HTML pages have FAQPage, HowTo or QAPage markup (full marks at a quarter of the pages).",
      }),
      entry({
        key: "aeo.conciseAnswers",
        label: "Concise answer blocks",
        score: 40,
        weight: 0.58,
        evidence: "2 of 5 question-style headings are answered by a paragraph of at most 60 words.",
      }),
    ];
    render(<ScoreBreakdown area="aeo" entries={aeo} complete />);
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Short, direct answers", "Questions and answers marked up"]);
    expect(screen.getByText("Not counted")).toBeInTheDocument();
    expect(
      screen.getByText(/Measured, not counted: Google no longer shows FAQ results\./),
    ).toBeInTheDocument();
  });
});
