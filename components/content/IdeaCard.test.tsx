// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { idea } from "./content-fixtures";
import { IdeaCard } from "./IdeaCard";

const mocks = vi.hoisted(() => ({ postJson: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth/client-api", () => ({ postJson: mocks.postJson }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("IdeaCard", () => {
  it("shows a headline and one line, with the angle, question and sources under Technical details", () => {
    render(<IdeaCard idea={idea()} />);
    expect(screen.getByRole("heading", { name: "Five minutes to a first deploy" })).toBeVisible();
    expect(screen.getByText("You rebuilt this guide this week.")).toBeVisible();
    const details = screen.getByText(/Technical details/).closest("details") as HTMLElement;
    expect(details).toHaveTextContent("Show the shortest path");
    expect(details).toHaveTextContent("digest:2026-10-01#t1");
  });

  it("posts write-this for the idea and says so", async () => {
    mocks.postJson.mockResolvedValue({ ok: true, data: { jobIds: [1] } });
    render(<IdeaCard idea={idea()} />);
    fireEvent.click(screen.getByRole("button", { name: "Write this" }));
    await screen.findByText("Writing has started.");
    expect(mocks.postJson).toHaveBeenCalledWith("/api/content", {
      action: "write-this",
      ideaId: "acme-docs-20261002-five-minutes",
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("says a refusal calmly, in the server's own words, or in ours when it sent none", async () => {
    mocks.postJson.mockResolvedValueOnce({
      ok: false,
      error: "daily_cap",
      message: "Harbour has done its content work for today. It starts again tomorrow.",
    });
    render(<IdeaCard idea={idea()} />);
    fireEvent.click(screen.getByRole("button", { name: "Write this" }));
    await screen.findByText(
      "Harbour has done its content work for today. It starts again tomorrow.",
    );
    mocks.postJson.mockResolvedValueOnce({ ok: false, error: "token_missing" });
    fireEvent.click(screen.getByRole("button", { name: "Write this" }));
    await screen.findByText(/isn't connected to Claude yet/);
    expect(screen.queryByText(/token_missing/)).toBeNull();
  });

  it("offers Try again, not Write this, when the step failed", () => {
    render(<IdeaCard idea={idea({ retry: true, note: "The draft didn't finish. Try again." })} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Write this" })).toBeNull();
  });

  it("offers no run button on an idea that is being written or discarded", () => {
    render(<IdeaCard idea={idea({ tab: "writing" })} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
