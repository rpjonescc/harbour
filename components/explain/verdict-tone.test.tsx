// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { SubScoreRow } from "../products/SubScoreRow";
import { VerdictLine } from "./VerdictLine";

const entry = (score: number): ScoreBreakdownEntry => ({
  key: "seo.technicalHealth",
  label: "Technical health",
  score,
  weight: 0.3,
  status: "ok",
  evidence: "3 of 3 pages answer with a success status.",
});
const family = (className: string) =>
  /text-good/.test(className)
    ? "good"
    : /bg-warn-soft|text-warn/.test(className)
      ? "warn"
      : "neutral";

describe("verdict colours", () => {
  it.each([
    [90, "Strong", "good"],
    [75, "Good", "good"],
    [60, "Fair", "neutral"],
    [30, "Needs work", "warn"],
  ])(
    "a score of %d (%s) is %s in the verdict line and in the sub-score chip",
    (score, label, tone) => {
      const { unmount } = render(<VerdictLine area="seo" score={score} />);
      expect(family(screen.getByText(label).className)).toBe(tone);
      unmount();
      render(<SubScoreRow entry={entry(score)} />);
      expect(family(screen.getByText(label).className)).toBe(tone);
    },
  );
});
