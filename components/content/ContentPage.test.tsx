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
      voice: [{ productId: "acme-docs", name: "Acme Docs", state: "missing" }],
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
        view={view({ capped: true, unreadable: ["content/ideas/acme-docs/x.md"] })}
        template={null}
      />,
    );
    expect(
      screen.getByText(/This file couldn't be read: content\/ideas\/acme-docs\/x\.md/),
    ).toBeVisible();
    expect(screen.getByText("Showing the newest 200 ideas.")).toBeVisible();
  });
});
