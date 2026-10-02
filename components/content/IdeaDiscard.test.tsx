// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { idea, piece } from "./content-fixtures";
import { IdeaDiscard } from "./IdeaDiscard";

const mocks = vi.hoisted(() => ({ postJson: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth/client-api", () => ({ postJson: mocks.postJson }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("IdeaDiscard", () => {
  it("does not take focus when the page loads", () => {
    render(<IdeaDiscard idea={idea()} />);
    expect(screen.getByRole("button", { name: "Discard idea" })).not.toHaveFocus();
  });

  it("asks first, then posts the idea id and nothing else", async () => {
    mocks.postJson.mockResolvedValue({ ok: true, data: { jobIds: [1] } });
    render(<IdeaDiscard idea={idea()} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard idea" }));
    expect(mocks.postJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm discard of idea" }));
    await act(async () => {});
    expect(mocks.postJson).toHaveBeenCalledWith("/api/content", {
      action: "discard",
      ideaId: "acme-docs-20261002-five-minutes",
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("says the exports of approved pieces go too, when there are any", () => {
    render(<IdeaDiscard idea={idea({ pieces: [piece({ tab: "approved" })] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard idea" }));
    expect(screen.getByText(/exported files of approved pieces are removed/)).toBeVisible();
  });

  it("shows the server's refusal calmly, and returns focus on cancel", async () => {
    mocks.postJson.mockResolvedValue({
      ok: false,
      error: "already_discarded",
      message: "That idea is already discarded.",
    });
    render(<IdeaDiscard idea={idea()} />);
    const open = screen.getByRole("button", { name: "Discard idea" });
    fireEvent.click(open);
    fireEvent.click(screen.getByRole("button", { name: "Confirm discard of idea" }));
    await screen.findByText("That idea is already discarded.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(open).toHaveFocus();
  });

  it("is disabled and says Saving… while the decision is waiting", () => {
    render(<IdeaDiscard idea={idea({ saving: true })} />);
    expect(screen.getByRole("button", { name: "Discard idea" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
  });
});
