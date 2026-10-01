// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ScoreValue } from "./ScoreValue";

describe("ScoreValue", () => {
  it("shows a gap as a dash read as 'no score'", () => {
    const { container } = render(<ScoreValue value={null} delta={3} />);
    expect(container).toHaveTextContent("—no score");
    expect(screen.queryByText("up 3")).toBeNull();
  });

  it("shows the score, an incomplete mark and the change", () => {
    const { container } = render(<ScoreValue value={62} delta={-4} complete={false} />);
    expect(container).toHaveTextContent("62* (incomplete)▼down 4");
  });

  it("shows no mark or change for a complete score without a delta", () => {
    const { container } = render(<ScoreValue value={62} />);
    expect(container).toHaveTextContent(/^62$/);
  });
});
