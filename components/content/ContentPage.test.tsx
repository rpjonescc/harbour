// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ContentPage } from "./ContentPage";
import { idea, piece, view } from "./content-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ContentPage", () => {
  it("opens on Ready for you, with counts, the header line and one tab in the tab order", () => {
    render(<ContentPage view={view()} template={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "Content" })).toBeVisible();
    expect(
      screen.getByText(
        "Ideas and drafts from your recent work. Nothing is posted until you post it.",
      ),
    ).toBeVisible();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveTextContent("Ready for you (1)");
    expect(tabs.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("opens on the default tab but keeps the spec's tab order", () => {
    render(<ContentPage view={view({ defaultTab: "ideas" })} template={null} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "false",
      "false",
      "true",
      "false",
      "false",
      "false",
    ]);
  });

  it("shows the no-voice gap with the template, and the digest gap line", () => {
    const gap = view({
      digest: { gap: true },
      voice: [{ productId: "acme-docs", name: "Acme Docs", state: "missing", notesMissing: false }],
    });
    render(<ContentPage view={gap} template={"---\nproduct: acme-docs\n---"} />);
    expect(
      screen.getByText("Write a voice profile for Acme Docs so drafts sound like it."),
    ).toBeVisible();
    expect(
      screen.getByText("Ideas this week come from your notes only. Screenpipe wasn't reachable."),
    ).toBeVisible();
    expect(screen.getByText(/product: acme-docs/)).toBeInTheDocument();
  });

  it("says Nothing waiting when the Ideas tab is empty and the voice is fine", () => {
    const empty = view({
      ideas: [],
      defaultTab: "ideas",
      tabs: view().tabs.map((t) => ({ ...t, count: 0 })),
    });
    render(<ContentPage view={empty} template={null} />);
    expect(screen.getByText("Nothing waiting. Enjoy the quiet.")).toBeInTheDocument();
  });

  it("says all six are ready to post when every piece of an idea is approved", () => {
    const approved = Array.from({ length: 6 }, (_, i) =>
      piece({ id: `x.p${i}`, tab: "approved", state: "approved" }),
    );
    render(
      <ContentPage
        view={view({
          defaultTab: "approved",
          ideas: [idea({ tab: null, pieces: approved, rollup: "6 approved" })],
        })}
        template={null}
      />,
    );
    expect(screen.getByText("All six are ready to post.")).toBeInTheDocument();
  });

  it("names a file that couldn't be read and says when the list is cut short", () => {
    render(
      <ContentPage
        view={view({ capped: "ideas", unreadable: ["content/ideas/acme-docs/x.md"] })}
        template={null}
      />,
    );
    expect(
      screen.getByText(/This file couldn't be read: content\/ideas\/acme-docs\/x\.md/),
    ).toBeVisible();
    expect(screen.getByText(/Showing the newest 200 ideas/)).toBeVisible();
  });

  it("names the cap that cut the list short", () => {
    render(<ContentPage view={view({ capped: "pieces" })} template={null} />);
    expect(screen.getByText(/Showing the newest 600 pieces/)).toBeVisible();
  });

  it("says plainly when the content folder couldn't be read", () => {
    render(<ContentPage view={view({ folderError: true })} template={null} />);
    expect(screen.getByText(/couldn't read the content folder/)).toBeVisible();
  });

  it("says what will appear, when and why in an empty tab", () => {
    render(<ContentPage view={view()} template={null} />);
    expect(
      screen.getByText(/Drafts that need a look from you will appear here/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing needs you right now/)).toBeInTheDocument();
  });

  it("shows an idea that has stopped before it has pieces under Needs you, with Try again", () => {
    const stuck = idea({
      tab: "needs-you",
      retry: true,
      note: "The platform pieces didn't finish. Try again.",
    });
    render(
      <ContentPage
        view={view({
          defaultTab: "needs-you",
          tabs: view().tabs.map((t) => (t.id === "needs-you" ? { ...t, count: 1 } : t)),
          ideas: [stuck],
        })}
        template={null}
      />,
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("lets the owner discard an idea whose pieces were not written, and a stuck one, but not a discarded one", () => {
    const stub = piece({
      tab: "needs-you",
      empty: true,
      text: "",
      copy: [],
      needsYou: "Not written.",
    });
    const tabs = view().tabs.map((t) => (t.id === "needs-you" ? { ...t, count: 2 } : t));
    const { rerender } = render(
      <ContentPage
        view={view({
          defaultTab: "needs-you",
          tabs,
          ideas: [
            idea({ tab: null, pieces: [stub], rollup: "1 needs you" }),
            idea({ id: "acme-docs-20261002-stuck", tab: "needs-you", retry: true }),
          ],
        })}
        template={null}
      />,
    );
    expect(screen.getAllByRole("button", { name: /^Discard idea: / })).toHaveLength(2);
    rerender(
      <ContentPage
        view={view({ defaultTab: "discarded", ideas: [idea({ tab: "discarded" })] })}
        template={null}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Discard idea/ })).toBeNull();
  });
});
