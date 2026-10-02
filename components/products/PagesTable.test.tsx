// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { PageRow } from "@/lib/scan/page-rows";
import { PagesTable } from "./PagesTable";

const rows: PageRow[] = [
  { url: "https://docs.example.com/old", status: 404, title: null, problems: ["Didn't load"] },
  { url: "https://docs.example.com/", status: 200, title: "Acme Docs", problems: [] },
];

describe("PagesTable", () => {
  it("says in a sentence how many pages need attention and tucks the table into Technical details", () => {
    render(<PagesTable rows={rows} total={2} />);
    expect(
      screen.getByText("Harbour checked 2 pages. 1 has something to fix."),
    ).toBeInTheDocument();
    const details = screen.getByText(/Technical details/).closest("details") as HTMLElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByRole("table")).toBeInTheDocument();
  });

  it("uses plain column headers and plain results", () => {
    render(<PagesTable rows={rows} total={2} />);
    const names = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(names).toEqual(["Page", "Result", "What to fix"]);
    expect(screen.getByText("Not found (404)")).toBeInTheDocument();
    expect(screen.getByText("Loaded (200)")).toBeInTheDocument();
    expect(screen.getByText("Didn't load")).toBeInTheDocument();
  });

  it("says what will appear before the first scan", () => {
    render(<PagesTable rows={[]} total={0} />);
    expect(screen.getByText(/The pages Harbour checks will be listed here/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says when the table lists only the most troubled pages of a big site", () => {
    render(<PagesTable rows={rows} total={120} />);
    expect(screen.getByText(/The 2 pages with the most to fix, of 120/)).toBeInTheDocument();
  });
});
