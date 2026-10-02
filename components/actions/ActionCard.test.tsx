// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { exampleActionView } from "@/components/design/action-example-data";
import type { ActionView } from "@/lib/actions/views";
import type { Product } from "@/lib/products/catalog";
import { ActionCard } from "./ActionCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const PRODUCT: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
};

function renderCard(over: Partial<ActionView> = {}) {
  const action = exampleActionView(over);
  render(
    <ActionCard
      action={action}
      product={PRODUCT}
      locale="en-GB"
      timeZone="Europe/London"
      today="2026-10-02"
    />,
  );
  return screen.getByRole("article", { name: action.title });
}

describe("ActionCard", () => {
  it("renders every field", () => {
    const card = renderCard();
    expect(card).toHaveAttribute("id", "action-1");
    expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent(
      "3 pages have no title",
    );
    for (const text of ["High impact", "SEO", "Acme Docs", "Open", "From scan"]) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    expect(card).toHaveTextContent("Search results show a generated title");
    const terms = within(card)
      .getAllByRole("term")
      .map((t) => t.textContent);
    expect(terms).toEqual(["Fix", "Done when", "Effort"]);
    expect(card).toHaveTextContent("Give each page a unique title");
    expect(card).toHaveTextContent("Every page has a title.");
    expect(within(card).getByText("Small")).toBeInTheDocument();
    expect(within(card).getByText("Evidence (3)")).toBeInTheDocument();
    expect(within(card).getByText("…and 1 more")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "research/acme-docs/seo.md" })).toHaveAttribute(
      "href",
      "/brain/research/acme-docs/seo.md",
    );
    expect(within(card).getByText("History")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Mark done: 3 pages have no title" }),
    ).toBeVisible();
    expect(
      within(card).getByRole("button", { name: "Hand to Claude: 3 pages have no title" }),
    ).toBeInTheDocument();
  });

  it("shows the snooze date and the analyst as the source", () => {
    const card = renderCard({ status: "snoozed", snoozedUntil: "2026-10-12", source: "agent" });
    expect(within(card).getByText("Snoozed until 12 Oct 2026")).toBeInTheDocument();
    expect(within(card).getByText("Suggested by the weekly analyst")).toBeInTheDocument();
  });

  it("shows agent text as plain text, never markup", () => {
    const card = renderCard({ source: "agent", title: "<b>Bold</b> claim", why: "<i>x</i>" });
    expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent("<b>Bold</b> claim");
    expect(card.querySelector("b, i")).toBeNull();
  });

  it("links evidence only for http(s) URLs", () => {
    const card = renderCard({
      evidence: {
        items: [
          { text: "Live page", url: "https://docs.example.com/a" },
          { text: "No link", url: null },
          { text: "Scripted", url: "javascript:alert(1)" },
        ],
        total: 3,
      },
    });
    const link = within(card).getByRole("link", { name: "Live page" });
    expect(link).toHaveAttribute("href", "https://docs.example.com/a");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(within(card).queryByRole("link", { name: "No link" })).toBeNull();
    expect(within(card).queryByRole("link", { name: "Scripted" })).toBeNull();
    expect(within(card).getByText("Scripted")).toBeInTheDocument();
  });

  it("says when stored evidence could not be read and when a doc is missing", () => {
    const card = renderCard({
      evidence: { items: [], total: 0 },
      evidenceInvalid: true,
      docLinks: [{ path: "gone.md", exists: false }],
    });
    expect(card).toHaveTextContent("Harbour could not read the stored evidence.");
    expect(within(card).queryByRole("link", { name: "gone.md" })).toBeNull();
    expect(card).toHaveTextContent("gone.md (not in the brain)");
  });

  it("lists the history: date, who, from → to, note", () => {
    const card = renderCard({
      events: [
        { at: new Date("2026-10-01T09:00:00Z"), actor: "scan", from: null, to: "open", note: null },
        {
          at: new Date("2026-10-02T09:30:00Z"),
          actor: "owner",
          from: "open",
          to: "in_progress",
          note: "Started on the docs",
        },
      ],
      historyTruncated: true,
    });
    const items = within(card)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toContain("1 Oct 2026, 10:00 · Scan · created as Open");
    expect(items).toContain("2 Oct 2026, 10:30 · You · Open → In progress · Started on the docs");
    expect(card).toHaveTextContent("Older history pruned.");
  });

  it("links the fix's pull request in a new tab", () => {
    const card = renderCard({ prUrl: "https://github.com/acme/widget/pull/42" });
    const link = within(card).getByRole("link", { name: /pull request acme\/widget#42/i });
    expect(link).toHaveAttribute("href", "https://github.com/acme/widget/pull/42");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName("Pull request acme/widget#42 (opens in a new tab)");
  });

  it("shows no pull request link without one, or for a stored value that is not one", () => {
    expect(within(renderCard()).queryByRole("link", { name: /pull request/i })).toBeNull();
    const bad = renderCard({ id: 2, title: "Other", prUrl: "javascript:alert(1)" });
    expect(within(bad).queryByRole("link", { name: /pull request/i })).toBeNull();
  });

  it("shows Claude's notes, and a link change without a status move", () => {
    const card = renderCard({
      events: [
        {
          at: new Date("2026-10-02T09:30:00Z"),
          actor: "claude",
          from: "open",
          to: "in_progress",
          note: "Fixing in the docs repo",
        },
        {
          at: new Date("2026-10-02T09:40:00Z"),
          actor: "claude",
          from: "in_progress",
          to: "in_progress",
          note: "Linked PR https://github.com/acme/widget/pull/42",
        },
      ],
    });
    const items = within(card)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toContain(
      "2 Oct 2026, 10:30 · Claude · Open → In progress · Fixing in the docs repo",
    );
    expect(items).toContain(
      "2 Oct 2026, 10:40 · Claude · Linked PR https://github.com/acme/widget/pull/42",
    );
  });
});
