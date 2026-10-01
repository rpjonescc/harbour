// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { DocView } from "@/lib/brain/view-model";
import { DocArticle } from "./DocArticle";

vi.mock("server-only", () => ({}));

function view(overrides: Partial<DocView["doc"]> = {}): DocView {
  return {
    doc: {
      path: "notes/big.md",
      absolutePath: "/example/brain/notes/big.md",
      title: "big",
      frontmatter: {},
      frontmatterError: null,
      body: "",
      mtime: new Date("2026-01-10T00:00:00Z"),
      tooLarge: false,
      ...overrides,
    },
    html: "<p>Body</p>",
    outline: [],
    backlinks: [],
    editorUrl: "vscode://file/example",
    stale: false,
    wasNew: false,
  };
}

describe("DocArticle", () => {
  it("explains an oversized document and links to the editor instead of rendering it", () => {
    render(<DocArticle view={{ ...view({ tooLarge: true }), html: "" }} />);
    expect(screen.getByText(/larger than 2 MB and isn't shown/)).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /editor/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "vscode://file/example");
  });

  it("renders the title at the requested heading level", () => {
    render(<DocArticle view={view()} titleLevel={2} />);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "big" })).toBeInTheDocument();
  });
});
