// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { checkTransition } from "@/lib/actions/transitions";
import type { ActionStatus } from "@/lib/actions/types";
import { ActionAnnouncer } from "./ActionAnnouncer";
import { ActionStatusControls } from "./ActionStatusControls";
import { STATUS_CONTROLS } from "./action-labels";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const TITLE = "3 pages have no title";
const TODAY = "2026-10-02";

function renderControls(status: ActionStatus) {
  return render(<ActionStatusControls id={7} title={TITLE} status={status} today={TODAY} />);
}

const buttonNames = () => screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));

describe("ActionStatusControls", () => {
  afterEach(() => vi.resetAllMocks());

  it.each<[ActionStatus, string[]]>([
    ["suggested", ["Accept", "Reject"]],
    ["open", ["Start", "Mark done", "Snooze…", "Dismiss"]],
    ["in_progress", ["Back to open", "Mark done", "Snooze…", "Dismiss"]],
    ["snoozed", ["Wake now", "Mark done", "Dismiss"]],
    ["done", ["Reopen"]],
    ["dismissed", ["Restore"]],
  ])("offers exactly the allowed buttons for %s", (status, labels) => {
    renderControls(status);
    expect(buttonNames()).toEqual(labels.map((label) => `${label}: ${TITLE}`));
  });

  it("offers only transitions the server allows", () => {
    for (const [from, controls] of Object.entries(STATUS_CONTROLS)) {
      for (const { to } of controls) {
        const until = to === "snoozed" ? "2026-10-09" : undefined;
        expect(checkTransition(from as ActionStatus, { to, until }, TODAY)).toBeNull();
      }
    }
  });

  it("posts the change, refreshes and announces it", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { id: 7, status: "done" } });
    renderControls("open");
    fireEvent.click(screen.getByRole("button", { name: `Mark done: ${TITLE}` }));
    expect(screen.getByRole("button", { name: `Start: ${TITLE}` })).toBeDisabled();
    expect(await screen.findByRole("status")).toHaveTextContent(`Marked done: ${TITLE}`);
    expect(api.postJson).toHaveBeenCalledWith("/api/actions/7", { from: "open", to: "done" });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("announces through a shared board region when there is one", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { id: 7, status: "open" } });
    render(
      <ActionAnnouncer>
        <ActionStatusControls id={7} title={TITLE} status="suggested" today={TODAY} />
      </ActionAnnouncer>,
    );
    fireEvent.click(screen.getByRole("button", { name: `Accept: ${TITLE}` }));
    expect(await screen.findByRole("status")).toHaveTextContent(`Accepted: ${TITLE}`);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("says the action changed meanwhile on a 409 and refreshes", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "stale" });
    renderControls("open");
    fireEvent.click(screen.getByRole("button", { name: `Dismiss: ${TITLE}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This action changed meanwhile — refreshed.",
    );
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("reports other failures without refreshing", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "network_error" });
    renderControls("open");
    fireEvent.click(screen.getByRole("button", { name: `Start: ${TITLE}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't update the action — try again.",
    );
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: `Start: ${TITLE}` })).toBeEnabled();
  });
});

describe("SnoozeForm in the status controls", () => {
  afterEach(() => vi.resetAllMocks());

  function openSnooze() {
    renderControls("open");
    const trigger = screen.getByRole("button", { name: `Snooze…: ${TITLE}` });
    fireEvent.click(trigger);
    return trigger;
  }

  it("moves focus into a bounded date field", () => {
    const trigger = openSnooze();
    const input = screen.getByLabelText("Snooze until");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("min", "2026-10-03");
    expect(input).toHaveAttribute("max", "2027-10-02");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("returns focus to the trigger on cancel", () => {
    const trigger = openSnooze();
    fireEvent.click(screen.getByRole("button", { name: `Cancel snooze: ${TITLE}` }));
    expect(screen.queryByLabelText("Snooze until")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("refuses an empty or out-of-range date", () => {
    openSnooze();
    const snooze = screen.getByRole("button", { name: `Snooze: ${TITLE}` });
    fireEvent.click(snooze);
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a date");
    fireEvent.change(screen.getByLabelText("Snooze until"), { target: { value: "2026-10-02" } });
    fireEvent.click(snooze);
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a date");
    expect(api.postJson).not.toHaveBeenCalled();
  });

  it("posts the snooze date", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { id: 7, status: "snoozed" } });
    openSnooze();
    fireEvent.change(screen.getByLabelText("Snooze until"), { target: { value: "2026-10-12" } });
    fireEvent.click(screen.getByRole("button", { name: `Snooze: ${TITLE}` }));
    expect(await screen.findByText(`Snoozed: ${TITLE}`)).toBeInTheDocument();
    expect(api.postJson).toHaveBeenCalledWith("/api/actions/7", {
      from: "open",
      to: "snoozed",
      until: "2026-10-12",
    });
  });
});
