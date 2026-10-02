// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

const counts = vi.hoisted(() => ({
  open: 0,
  brain: 0 as number | null,
  path: "/",
  content: "off" as "on" | "off",
  ready: 0,
}));
vi.mock("next/navigation", () => ({ usePathname: () => counts.path, useRouter: () => ({}) }));
vi.mock("@/lib/brain/runtime", () => ({ brainNewCount: () => counts.brain }));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    getConfig: () => ({ ...actual.getConfig(), HARBOUR_CONTENT: counts.content }),
  };
});
vi.mock("@/lib/content/read/ready-count", () => ({ countReadyPieces: () => counts.ready }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/actions/views", () => ({ openActionCount: () => counts.open }));

describe("Sidebar badges", () => {
  it("links Actions to the board with the open count", () => {
    counts.open = 3;
    render(<Sidebar theme="system" />);
    const link = screen.getByRole("link", { name: /Actions/ });
    expect(link).toHaveAttribute("href", "/actions");
    expect(screen.getByText("3 things worth doing")).toHaveClass("sr-only");
  });

  it("uses the singular for one", () => {
    counts.open = 1;
    counts.brain = 1;
    render(<Sidebar theme="system" />);
    expect(screen.getByText("1 thing worth doing")).toBeInTheDocument();
    expect(screen.getByText("1 new document")).toBeInTheDocument();
  });
});

describe("Sidebar content link", () => {
  afterEach(() => {
    cleanup();
    counts.content = "off";
    counts.ready = 0;
  });

  it("hides Content while content is off", () => {
    render(<Sidebar theme="system" />);
    expect(screen.queryByRole("link", { name: /Content/ })).toBeNull();
  });

  it("shows Content with the ready count when content is on", () => {
    counts.content = "on";
    counts.ready = 4;
    render(<Sidebar theme="system" />);
    expect(screen.getByRole("link", { name: /Content/ })).toHaveAttribute("href", "/content");
    expect(screen.getByText("4 ready for you")).toHaveClass("sr-only");
  });
});

describe("Sidebar current page", () => {
  afterEach(() => {
    cleanup();
    counts.path = "/";
  });

  it.each([
    ["/settings/devices", "Devices"],
    ["/settings/sources", "Sources"],
    ["/settings", "Settings"],
    ["/settings/products/acme-docs", "Settings"],
  ])("marks exactly one item current on %s", (path, label) => {
    counts.path = path;
    render(<Sidebar theme="system" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const current = within(nav)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it("links Settings after Devices", () => {
    render(<Sidebar theme="system" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels.indexOf("Settings")).toBe(labels.indexOf("Devices") + 1);
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});
