// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { piece } from "./content-fixtures";
import { PieceActions } from "./PieceActions";

const mocks = vi.hoisted(() => ({ postJson: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth/client-api", () => ({ postJson: mocks.postJson }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
beforeEach(() => mocks.postJson.mockResolvedValue({ ok: true, data: { jobIds: [1] } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const ID = "acme-docs-20261002-five-minutes.linkedin";

describe("PieceActions", () => {
  it("makes the owner tick every flag before Confirm approval is enabled, then posts the ticked flags", async () => {
    render(
      <PieceActions
        piece={piece({
          flags: ["pricing", "legal"],
          flagLines: ["Check before posting: 1 pricing claim, 1 legal claim"],
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    const confirm = screen.getByRole("button", { name: "Confirm approval" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "I've checked the pricing claim" }));
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "I've checked the legal claim" }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await act(async () => {});
    expect(mocks.postJson).toHaveBeenCalledWith("/api/content", {
      action: "approve",
      pieceId: ID,
      revision: 2,
      checkedFlags: ["pricing", "legal"],
      confirmOpen: false,
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("names what is still open for a Needs you piece and sends confirmOpen", async () => {
    render(
      <PieceActions
        piece={piece({
          tab: "needs-you",
          state: "needs-you",
          needsYou: "The humanizer check still found 1 pattern.",
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(
      screen.getByText("Approve anyway? The humanizer check still found 1 pattern."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    await act(async () => {});
    expect(mocks.postJson).toHaveBeenCalledWith(
      "/api/content",
      expect.objectContaining({ confirmOpen: true }),
    );
  });

  it("edits through a labelled textarea prefilled with the piece's own text", async () => {
    render(<PieceActions piece={piece()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Edit the piece text" });
    expect(box).toHaveValue("Docs that ship in five minutes.");
    fireEvent.change(box, { target: { value: "Docs in five minutes, plainly." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {});
    expect(mocks.postJson).toHaveBeenCalledWith("/api/content", {
      action: "edit",
      pieceId: ID,
      revision: 2,
      body: "Docs in five minutes, plainly.",
    });
  });

  it("does not save an empty edit", () => {
    render(<PieceActions piece={piece()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit the piece text" }), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("asks before discarding, and posts nothing until it is confirmed", async () => {
    render(<PieceActions piece={piece()} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(mocks.postJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
    await act(async () => {});
    expect(mocks.postJson).toHaveBeenCalledWith("/api/content", {
      action: "discard",
      pieceId: ID,
      revision: 2,
    });
  });

  it("says a refusal calmly in the server's words, and keeps the panel open", async () => {
    mocks.postJson.mockResolvedValue({
      ok: false,
      error: "stale",
      message: "This piece changed since you opened it. Reload and try again.",
    });
    render(<PieceActions piece={piece()} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
    await screen.findByText("This piece changed since you opened it. Reload and try again.");
    expect(screen.getByRole("button", { name: "Confirm discard" })).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("says why the last decision saved nothing, when the page knows", () => {
    render(
      <PieceActions
        piece={piece({
          decisionError:
            "You have unsaved changes to this piece in your editor; Harbour saved nothing.",
        })}
      />,
    );
    expect(screen.getByText(/You have unsaved changes to this piece/)).toBeVisible();
  });

  it("shows Saving… in a status region and refreshes every two seconds while a decision is pending", () => {
    vi.useFakeTimers();
    try {
      render(<PieceActions piece={piece({ saving: true })} />);
      expect(screen.getByRole("status")).toHaveTextContent("Saving…");
      expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
      act(() => void vi.advanceTimersByTime(4100));
      expect(mocks.refresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll when nothing is pending", () => {
    vi.useFakeTimers();
    try {
      render(<PieceActions piece={piece()} />);
      act(() => void vi.advanceTimersByTime(6000));
      expect(mocks.refresh).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns focus to the button that opened a panel when it closes", () => {
    render(<PieceActions piece={piece()} />);
    const edit = screen.getByRole("button", { name: "Edit" });
    fireEvent.click(edit);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(edit).toHaveFocus();
  });

  it("offers only Discard for a piece that wasn't written, and nothing for a discarded one", () => {
    const { rerender } = render(
      <PieceActions piece={piece({ tab: "needs-you", empty: true, text: "", copy: [] })} />,
    );
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("button", { name: "Discard" })).toBeVisible();
    rerender(<PieceActions piece={piece({ tab: "discarded", state: "discarded" })} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Discard but not Approve or Edit for a step that failed", () => {
    render(<PieceActions piece={piece({ tab: "needs-you", retry: true })} />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByRole("button", { name: "Discard" })).toBeVisible();
  });

  it("offers Discard but not Approve or Edit for an approved piece", () => {
    render(<PieceActions piece={piece({ tab: "approved", state: "approved" })} />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("button", { name: "Discard" })).toBeVisible();
  });

  it("names flags in plain words at approval", () => {
    render(<PieceActions piece={piece({ flags: ["curriculum", "comparative"] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(
      screen.getByRole("checkbox", { name: "I've checked the curriculum or education claim" }),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "I've checked the comparison claim" }),
    ).toBeVisible();
  });

  it("limits the edit box to the platform's cap and counts what is typed", () => {
    render(<PieceActions piece={piece()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Edit the piece text" });
    expect(box).toHaveAttribute("maxlength", "3000");
    expect(screen.getByText("31 of 3,000 characters.")).toBeVisible();
  });
});
