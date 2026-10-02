// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { sourceExplanation } from "@/lib/explain/sources";
import { PaidSourcePanels } from "./PaidSourcePanels";

describe("PaidSourcePanels", () => {
  it("says plainly that Harbour doesn't collect this data yet, using the sources' own sentence", () => {
    render(<PaidSourcePanels />);
    const first = sourceExplanation("openai").connect[0] ?? "";
    expect(first).not.toBe("");
    for (const region of screen.getAllByRole("region")) {
      expect(region).toHaveTextContent(first);
      expect(region).not.toHaveTextContent(/HARBOUR_/);
    }
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("only names sources Harbour knows, so a typo fails loudly", () => {
    expect(() => sourceExplanation("openai")).not.toThrow();
    expect(() => sourceExplanation("dataforseo")).not.toThrow();
  });
});
