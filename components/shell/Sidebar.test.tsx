// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

const counts = vi.hoisted(() => ({ open: 0, brain: 0 as number | null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({}) }));
vi.mock("@/lib/brain/runtime", () => ({ brainNewCount: () => counts.brain }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/actions/views", () => ({ openActionCount: () => counts.open }));

describe("Sidebar badges", () => {
  it("links Actions to the board with the open count", () => {
    counts.open = 3;
    render(<Sidebar theme="system" />);
    const link = screen.getByRole("link", { name: /Actions/ });
    expect(link).toHaveAttribute("href", "/actions");
    expect(screen.getByText("3 open actions")).toHaveClass("sr-only");
  });

  it("uses the singular for one", () => {
    counts.open = 1;
    counts.brain = 1;
    render(<Sidebar theme="system" />);
    expect(screen.getByText("1 open action")).toBeInTheDocument();
    expect(screen.getByText("1 new document")).toBeInTheDocument();
  });
});
