// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("shows the h1, the intro, page help and the extra controls", () => {
    render(
      <PageHeader title="Sources" intro="Where each score's data comes from." page="sources">
        <button type="button">Check now</button>
      </PageHeader>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Sources" })).toBeInTheDocument();
    expect(screen.getByText("Where each score's data comes from.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What's this page?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check now" })).toBeInTheDocument();
  });

  it("leaves the intro out when there is none, and can give the h1 an id to move focus to", () => {
    render(<PageHeader title="Actions" page="actions" titleId="top" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Actions" });
    expect(h1).toHaveAttribute("id", "top");
    expect(h1).toHaveAttribute("tabindex", "-1");
    expect(document.querySelector("[data-page-intro]")).toBeNull();
  });

  it("can title an example with an h2 when shown inside another page", () => {
    render(<PageHeader title="Second Brain" page="brain" titleLevel={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "Second Brain" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("leads with the page's verdict under the title, its mark beside the words", () => {
    render(
      <PageHeader
        title="Agents"
        page="agents"
        verdict={{ tone: "ok", text: "Nothing is running. The last 5 runs worked." }}
      />,
    );
    const verdict = document.querySelector("[data-page-verdict]");
    expect(verdict).toHaveTextContent("Nothing is running. The last 5 runs worked.");
    expect(verdict?.querySelector('svg[aria-hidden="true"]')).toHaveAttribute("data-tone", "ok");
  });

  it("has no verdict line when the page gives none", () => {
    render(<PageHeader title="Design" page="design" />);
    expect(document.querySelector("[data-page-verdict]")).toBeNull();
  });
});
