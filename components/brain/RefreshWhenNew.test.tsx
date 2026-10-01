// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { RefreshWhenNew } from "./RefreshWhenNew";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("RefreshWhenNew", () => {
  afterEach(() => refresh.mockReset());

  it("refreshes exactly once when the document was new", () => {
    const { rerender } = render(<RefreshWhenNew path="a.md" wasNew />);
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<RefreshWhenNew path="a.md" wasNew />);
    rerender(<RefreshWhenNew path="a.md" wasNew={false} />);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never refreshes when the document was not new", () => {
    const { rerender } = render(<RefreshWhenNew path="a.md" wasNew={false} />);
    rerender(<RefreshWhenNew path="a.md" wasNew={false} />);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes again for a different new document", () => {
    const { rerender } = render(<RefreshWhenNew path="a.md" wasNew />);
    rerender(<RefreshWhenNew path="b.md" wasNew />);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
