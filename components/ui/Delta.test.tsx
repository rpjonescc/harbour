// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Delta } from "./Delta";

describe("Delta", () => {
  it("announces increases", () => {
    render(<Delta value={3} />);
    expect(screen.getByText("up 3")).toBeInTheDocument();
  });

  it("announces decreases", () => {
    render(<Delta value={-2} />);
    expect(screen.getByText("down 2")).toBeInTheDocument();
  });

  it("renders nothing for no change", () => {
    const { container } = render(<Delta value={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
