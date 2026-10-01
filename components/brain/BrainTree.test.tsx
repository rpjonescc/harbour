// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { TreeNode } from "@/lib/brain/tree";
import { BrainTree } from "./BrainTree";
import { ViewedDoc, ViewedDocProvider } from "./ViewedDoc";

const navigation = vi.hoisted(() => ({ pathname: "/brain", refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: navigation.refresh }),
}));

const nodes: TreeNode[] = [
  {
    kind: "dir",
    name: "research",
    path: "research",
    children: [{ kind: "file", name: "a.md", path: "research/a.md" }],
  },
  {
    kind: "dir",
    name: "research-notes",
    path: "research-notes",
    children: [{ kind: "file", name: "x.md", path: "research-notes/x.md" }],
  },
];

function folder(name: string): HTMLDetailsElement {
  const summary = screen.getByText(name, { selector: "summary" });
  return summary.parentElement as HTMLDetailsElement;
}

describe("BrainTree", () => {
  afterEach(() => navigation.refresh.mockReset());

  it("never marks the open document as new, even when listed fresh", () => {
    navigation.pathname = "/brain/research/a.md";
    render(
      <BrainTree
        nodes={nodes}
        freshPaths={["research/a.md", "research-notes/x.md"]}
        truncated={false}
      />,
    );
    expect(screen.getByRole("link", { name: "a" })).not.toHaveTextContent("new");
    expect(screen.getByRole("link", { name: /^x/ })).toHaveTextContent("new");
  });

  it("opens only folders that truly contain the current document", () => {
    navigation.pathname = "/brain/research-notes/x.md";
    render(<BrainTree nodes={nodes} freshPaths={[]} truncated={false} />);
    expect(folder("research-notes").open).toBe(true);
    expect(folder("research").open).toBe(false);
  });

  it("does not refresh the router on render", () => {
    navigation.pathname = "/brain/research/a.md";
    render(<BrainTree nodes={nodes} freshPaths={[]} truncated={false} />);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("hides the dot of the document the page reports as viewed, such as the start doc at /brain", () => {
    navigation.pathname = "/brain";
    const start: TreeNode[] = [
      { kind: "file", name: "00-start-here.md", path: "00-start-here.md" },
    ];
    render(
      <ViewedDocProvider>
        <BrainTree nodes={start} freshPaths={["00-start-here.md"]} truncated={false} />
        <ViewedDoc path="00-start-here.md" />
      </ViewedDocProvider>,
    );
    expect(screen.getByRole("link", { name: "00-start-here" })).not.toHaveTextContent("new");
  });
});
