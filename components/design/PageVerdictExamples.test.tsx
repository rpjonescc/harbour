// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { PageVerdictExamples } from "./PageVerdictExamples";

describe("PageVerdictExamples", () => {
  it("shows a header verdict for each tone and an intro with a term, all as h2 examples", () => {
    const { container } = render(<PageVerdictExamples />);
    const verdicts = [...container.querySelectorAll("[data-page-verdict]")];
    expect(verdicts).toHaveLength(7);
    const tones = verdicts.map((v) => v.querySelector("svg")?.getAttribute("data-tone"));
    expect(new Set(tones)).toEqual(new Set(["ok", "busy", "ready", "watch", "act", "unknown"]));
    expect(verdicts[0]).toHaveTextContent("Nothing is running. The last 5 runs worked.");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("button", { name: "drafts" })).toBeInTheDocument();
  });
});
