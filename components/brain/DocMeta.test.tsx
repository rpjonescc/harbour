// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { DocMeta } from "./DocMeta";

describe("DocMeta", () => {
  it("renders repeated tags without duplicate-key warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DocMeta frontmatter={{ tags: ["seo", "seo"] }} stale={false} />);
    expect(screen.getAllByText("seo")).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
