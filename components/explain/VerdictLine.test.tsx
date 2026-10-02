// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { VerdictLine } from "./VerdictLine";

describe("VerdictLine", () => {
  it("leads with the area and the verdict, then the number and the trend", () => {
    const { container } = render(<VerdictLine area="seo" score={78} delta={2} />);
    expect(container).toHaveTextContent(
      "Found on Google Good 78 out of 100 up 2 since the last check",
    );
    expect(screen.getByText("Good")).toHaveClass("text-good");
  });

  it.each([
    [92, "Strong", "text-good"],
    [61, "Fair", "text-ink"],
    [34, "Needs work", "text-warn"],
  ])("shows %d as %s in words, never by colour alone", (score, label, tone) => {
    render(<VerdictLine area="geo" score={score} />);
    expect(screen.getByText(label)).toHaveClass(tone);
  });

  it("says steady for no change and leaves the trend out without one", () => {
    const { container, rerender } = render(<VerdictLine area="aeo" score={70} delta={0} />);
    expect(container).toHaveTextContent("Answer-ready Good 70 out of 100 steady");
    rerender(<VerdictLine area="aeo" score={70} />);
    expect(container).not.toHaveTextContent(/steady|since the last check/);
  });

  it("says why a score is missing instead of a verdict", () => {
    const { container } = render(
      <VerdictLine area="aeo" score={null} missingReason="Speed data is still arriving." />,
    );
    expect(container).toHaveTextContent("Answer-ready No score yet Speed data is still arriving.");
    expect(screen.queryByText("Needs work")).toBeNull();
    expect(container).not.toHaveTextContent("out of 100");
  });

  it("notes when some of the data behind a score was missing", () => {
    const { container } = render(<VerdictLine area="geo" score={61} delta={-2} complete={false} />);
    expect(container).toHaveTextContent(
      "Recommended by AI assistants Fair 61 out of 100 down 2 since the last check Some data was missing, so this may change.",
    );
  });

  it("drops the area name in a table cell and marks a partial score with an asterisk", () => {
    const { container } = render(<VerdictLine compact area="geo" score={46} complete={false} />);
    expect(screen.queryByText("Recommended by AI assistants")).toBeNull();
    expect(container).toHaveTextContent("Needs work 46 out of 100* (some data missing)");
  });
});
