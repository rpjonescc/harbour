// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PieceView } from "@/lib/content/read/view-types";
import { SEND_LINE } from "@/lib/explain/postiz";
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
const approved = (postiz: PieceView["postiz"]) =>
  piece({ tab: "approved", state: "approved", revision: 3, postiz });
const SEND = { name: "Send to Postiz as a draft" };

describe("Send to Postiz as a draft (spec 11)", () => {
  it("is not offered when Postiz is off or the piece is not approved", () => {
    render(<PieceActions piece={piece({ tab: "approved", state: "approved", postiz: null })} />);
    expect(screen.queryByRole("button", SEND)).toBeNull();
    cleanup();
    render(<PieceActions piece={piece()} />);
    expect(screen.queryByRole("button", SEND)).toBeNull();
  });

  it("sends an approved piece and says images are not sent", async () => {
    render(<PieceActions piece={approved({ sentAt: null, sending: false, error: null })} />);
    const button = screen.getByRole("button", SEND);
    expect(button).toHaveAccessibleDescription(SEND_LINE);
    fireEvent.click(button);
    await act(async () => {});
    expect(mocks.postJson).toHaveBeenCalledWith("/api/content", {
      action: "send-to-postiz",
      pieceId: ID,
      revision: 3,
      resend: false,
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("asks before sending a second draft, and Cancel sends nothing and returns focus", async () => {
    const sent = { sentAt: "3 Oct 2026, 11:00", sending: false, error: null };
    render(<PieceActions piece={approved(sent)} />);
    expect(screen.getByText("Sent to Postiz as a draft on 3 Oct 2026, 11:00.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", SEND));
    expect(
      screen.getByText(
        "You sent this to Postiz on 3 Oct 2026, 11:00. Send it again as a second draft?",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.postJson).not.toHaveBeenCalled();
    expect(screen.getByRole("button", SEND)).toHaveFocus();
    fireEvent.click(screen.getByRole("button", SEND));
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    await act(async () => {});
    expect(mocks.postJson).toHaveBeenCalledWith(
      "/api/content",
      expect.objectContaining({ action: "send-to-postiz", resend: true }),
    );
  });

  it("says Sending while queued, and shows why the last send didn't finish", () => {
    render(<PieceActions piece={approved({ sentAt: null, sending: true, error: null })} />);
    expect(screen.getByRole("button", SEND)).toBeDisabled();
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toContain("Sending to Postiz…");
    cleanup();
    const error = "Harbour couldn't reach Postiz, so nothing was sent.";
    render(<PieceActions piece={approved({ sentAt: null, sending: false, error })} />);
    expect(screen.getByText(error)).toBeVisible();
  });

  it("shows the server's refusal in its own words", async () => {
    mocks.postJson.mockResolvedValue({
      ok: false,
      error: "rate_limited",
      message: "Limit reached.",
    });
    render(<PieceActions piece={approved({ sentAt: null, sending: false, error: null })} />);
    fireEvent.click(screen.getByRole("button", SEND));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("Limit reached.");
  });
});
