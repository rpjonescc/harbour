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

/** The card's one Technical details section; everything else is the card's surface. */
function technicalDetails(card: HTMLElement): HTMLDetailsElement {
  const details = within(card).getByText("Technical details", { exact: false }).closest("details");
  if (!details) throw new Error("the card has no Technical details");
  return details;
}

/** The chips: the first block on the card, ahead of the title. */
function chipTexts(card: HTMLElement): (string | null)[] {
  return [...(card.firstElementChild?.children ?? [])].map((el) => el.textContent);
}

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
  it("leads with the title, one line, the win and who's on it, then a quiet meta line", () => {
    const card = renderCard();
    expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent(
      "3 pages have no title",
    );
    for (const text of ["Big win", "Waiting for you"]) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    expect(card).toHaveTextContent("Search results show a generated title");
    expect(card).toHaveTextContent("Found on Google · quick job · Acme Docs");
    // The status is implied by who's on it, so it is not repeated as a third tag.
    expect(within(card).queryByText("To do")).toBeNull();
    // Codes and the old effort wording are gone from the surface.
    expect(within(card).queryByText("SEO")).toBeNull();
    expect(within(card).queryByText("Small")).toBeNull();
  });

  it("puts area, effort and product in one small muted line, not tags", () => {
    const card = renderCard();
    const meta = within(card)
      .getByText(/^Found on Google · quick job/)
      .closest("p");
    expect(meta).toHaveTextContent("Found on Google · quick job · Acme Docs");
    expect(meta).toHaveClass("text-xs", "text-ink-muted");
    // The meta line is plain text: neither chip lives in it.
    expect(meta).not.toContainElement(within(card).getByText("Big win"));
    expect(meta).not.toContainElement(within(card).getByText("Waiting for you"));
  });

  it("shows at most two chips: the size of the win and who's on it or the status", () => {
    expect(chipTexts(renderCard())).toEqual(["Big win", "Waiting for you"]);
  });

  it("shows only the first sentence of the reason on the surface; the full text folds away", () => {
    const why = "Search results show a generated title. Visitors skip generic ones. Fix it soon.";
    const card = renderCard({ why });
    const surface = card.cloneNode(true) as HTMLElement;
    technicalDetails(surface).remove();
    expect(surface).toHaveTextContent("Search results show a generated title.");
    expect(surface).not.toHaveTextContent("Visitors skip generic ones");
    const inside = within(technicalDetails(card));
    expect(technicalDetails(card).querySelector("dt")).toHaveTextContent("Full reason");
    expect(inside.getByText("Full reason")).toBeInTheDocument();
    expect(inside.getByText(why)).toBeInTheDocument();
  });

  it("leaves no stray line or Full reason for a blank reason", () => {
    const card = renderCard({ why: "  \n " });
    expect(within(technicalDetails(card)).queryByText("Full reason")).toBeNull();
    const heading = within(card).getByRole("heading", { level: 3 });
    expect(heading.nextElementSibling?.textContent).toContain("Found on Google");
  });

  it("names the status quietly only for work in progress, and as the chip when no one is on it", () => {
    const working = renderCard({ status: "in_progress", who: "claude" });
    expect(within(working).getByText(/· In progress$/)).toBeInTheDocument();
    expect(within(working).getByText("Claude is on it")).toBeInTheDocument();
  });

  it.each([
    [{ status: "in_progress", who: null }, "In progress"],
    [{ status: "snoozed", who: null, snoozedUntil: "2026-10-12" }, "Snoozed until 12 Oct 2026"],
    [{ status: "done", who: null }, "Done"],
  ] as const)("shows %j as the status chip %j when no one is on it", (over, chip) => {
    const card = renderCard(over);
    expect(chipTexts(card)).toEqual(["Big win", chip]);
  });

  it("keeps the fix, source, rule key, evidence, docs and prompt inside Technical details", () => {
    const card = renderCard();
    const details = technicalDetails(card);
    const inside = within(details);
    for (const text of [
      "Fix",
      "Give each page a unique title of 10–60 characters.",
      "Done when",
      "Every page has a title.",
      "Found by a check",
      "missing-title",
      "Evidence (3)",
      "…and 1 more",
    ]) {
      expect(inside.getByText(text)).toBeInTheDocument();
    }
    expect(inside.getByRole("link", { name: "research/acme-docs/seo.md" })).toHaveAttribute(
      "href",
      "/brain/research/acme-docs/seo.md",
    );
    // A closed <details> hides its body from the accessibility tree; the button keeps its name.
    expect(
      inside.getByRole("button", { name: "Hand to Claude: 3 pages have no title", hidden: true }),
    ).toBeInTheDocument();
    expect(details).not.toHaveAttribute("open");
    expect(within(card).getByText("History")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Mark done: 3 pages have no title" }),
    ).toBeVisible();
  });

  it("keeps the source, rule key and prompt button off the card's surface", () => {
    const card = renderCard();
    const surface = card.cloneNode(true) as HTMLElement;
    const clone = technicalDetails(surface);
    clone.remove();
    const outside = within(surface);
    expect(outside.queryByText("Found by a check")).toBeNull();
    expect(outside.queryByText("missing-title")).toBeNull();
    expect(outside.queryByRole("button", { name: /^Hand to Claude/, hidden: true })).toBeNull();
  });

  it("gives every card its own names for the parts that repeat", () => {
    const first = exampleActionView({ id: 1, title: "First thing" });
    const second = exampleActionView({ id: 2, title: "Second thing" });
    render(
      <>
        {[first, second].map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            product={PRODUCT}
            locale="en-GB"
            timeZone="Europe/London"
            today="2026-10-02"
          />
        ))}
      </>,
    );
    const names = (selector: string, attribute?: string) =>
      [...document.querySelectorAll(selector)].map((el) =>
        attribute ? el.getAttribute(attribute) : el.textContent?.replace(/\s+/g, " ").trim(),
      );
    for (const list of [
      names("details > summary"),
      names("ul[aria-label^='Related docs']", "aria-label"),
    ]) {
      expect(new Set(list).size).toBe(list.length);
    }
    expect(names("ul[aria-label^='Related docs']", "aria-label")).toEqual([
      "Related docs: First thing",
      "Related docs: Second thing",
    ]);
    expect(names("details > summary")).toEqual([
      "History (First thing)",
      "Technical details (evidence, source and the prompt for Claude: First thing)",
      "History (Second thing)",
      "Technical details (evidence, source and the prompt for Claude: Second thing)",
    ]);
  });

  it("shows the snooze date, and the analyst as the source inside Technical details", () => {
    const card = renderCard({
      status: "snoozed",
      snoozedUntil: "2026-10-12",
      source: "agent",
      ruleKey: null,
      who: null,
    });
    expect(within(card).getByText("Snoozed until 12 Oct 2026")).toBeInTheDocument();
    expect(
      within(technicalDetails(card)).getByText("Suggested by the weekly analyst"),
    ).toBeInTheDocument();
    expect(within(card).queryByText("Waiting for you")).toBeNull();
  });

  it.each([
    ["claude", "Claude is on it"],
    ["pr_waiting", "Pull request waiting for your OK"],
    ["undecided", "New idea, not decided yet"],
  ] as const)("says %s as %j", (who, phrase) => {
    const card = renderCard({ who });
    expect(within(card).getByText(phrase)).toBeInTheDocument();
  });

  it("links the pull request on the card, outside Technical details", () => {
    const card = renderCard({
      status: "in_progress",
      who: "pr_waiting",
      prUrl: "https://github.com/example/site/pull/42",
    });
    const link = within(card).getByRole("link", { name: /Pull request example\/site#42/ });
    expect(link.closest("details")).toBeNull();
  });

  // Review Focus 5: unreadable stored evidence is a gap, and the rest of the section stays.
  it("says when stored evidence could not be read and keeps the other technical parts", () => {
    const card = renderCard({ evidenceInvalid: true, evidence: { items: [], total: 0 } });
    const inside = within(technicalDetails(card));
    expect(inside.getByText("Harbour could not read the stored evidence.")).toBeInTheDocument();
    expect(inside.getByText("Every page has a title.")).toBeInTheDocument();
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
    expect(items).toContain("1 Oct 2026, 10:00 · Harbour's check · created as To do");
    expect(items).toContain("2 Oct 2026, 10:30 · You · To do → In progress · Started on the docs");
    expect(card).toHaveTextContent("Older history was cleared to save space.");
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
      "2 Oct 2026, 10:30 · Claude · To do → In progress · Fixing in the docs repo",
    );
    expect(items).toContain(
      "2 Oct 2026, 10:40 · Claude · Linked PR https://github.com/acme/widget/pull/42",
    );
  });
});
