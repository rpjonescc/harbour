import { BOARD_COLUMNS } from "@/lib/actions/board-column";
import type { ActionActor } from "@/lib/actions/types";
import {
  BOARD_TEXT,
  COLUMN_COPY,
  explainerItems,
  lastMoveLine,
  MOVE_REFUSAL,
  PARKED_COPY,
  STUCK_DAYS,
} from "./board";

const NOW = new Date("2026-10-10T09:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const card = (over: Partial<Parameters<typeof COLUMN_COPY.backlog.waitingOn>[0]> = {}) => ({
  who: null,
  prUrl: null,
  isNewIdea: false,
  stuck: false,
  ...over,
});

const ALL_TEXT = BOARD_COLUMNS.flatMap((id) => {
  const copy = COLUMN_COPY[id];
  return [copy.name, copy.short, ...Object.values(copy.explainer)];
});
const CODES = /_|\bstage\b|\bstatus\b|\bin_progress\b|\bsuggested\b|\bsnoozed\b|HARBOUR/i;

describe("COLUMN_COPY", () => {
  it("names the six columns in plain words", () => {
    expect(BOARD_COLUMNS.map((id) => COLUMN_COPY[id].name)).toEqual([
      "Backlog",
      "Queue",
      "Started",
      "In progress",
      "In review",
      "Done",
    ]);
  });

  it.each(BOARD_COLUMNS)("%s has a short line and a full four-part explainer", (id) => {
    const { short, explainer } = COLUMN_COPY[id];
    expect(short).toMatch(/^[A-Z].*\.$/);
    for (const part of [explainer.what, explainer.whoMoves, explainer.next, explainer.ifStuck]) {
      expect(part).toMatch(/^[A-Z].*[.?]$/);
    }
  });

  it("uses no codes or stored values anywhere", () => {
    for (const text of ALL_TEXT) expect(text).not.toMatch(CODES);
  });

  it("keeps every explainer sentence short", () => {
    for (const text of ALL_TEXT) {
      for (const sentence of text.split(/(?<=[.?])\s+/)) {
        expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(22);
      }
    }
  });

  it("says the Done column holds the last 14 days", () => {
    expect(COLUMN_COPY.done.short).toContain("14 days");
    expect(COLUMN_COPY.done.explainer.what).toContain("14 days");
  });

  it("states the stuck limits it really uses", () => {
    expect(COLUMN_COPY.started.explainer.ifStuck).toContain(`${STUCK_DAYS.started} days`);
    expect(COLUMN_COPY.in_progress.explainer.ifStuck).toContain(`${STUCK_DAYS.in_progress} days`);
    expect(COLUMN_COPY.in_review.explainer.ifStuck).toContain(`${STUCK_DAYS.in_review} days`);
  });

  describe("waitingOn and whatNext", () => {
    it("asks the owner to decide on a new idea", () => {
      expect(COLUMN_COPY.backlog.waitingOn(card({ isNewIdea: true }))).toBe(
        "Waiting for you to accept or dismiss it.",
      );
      expect(COLUMN_COPY.backlog.whatNext(card({ isNewIdea: true }))).toBe(
        "Accept it to keep it, or dismiss it.",
      );
    });

    it("says a plain backlog card waits for the owner to pick it up, a queued one for either", () => {
      expect(COLUMN_COPY.queue.waitingOn(card())).toBe("Waiting for you or Claude to start it.");
      expect(COLUMN_COPY.backlog.waitingOn(card())).toBe("Waiting for you to pick it up.");
      expect(COLUMN_COPY.backlog.whatNext(card())).toBe(
        "Move it to Queue when you want it done soon.",
      );
    });

    it("names who is working a started or in-progress card", () => {
      expect(COLUMN_COPY.started.waitingOn(card({ who: "claude" }))).toBe(
        "Claude is working on it.",
      );
      expect(COLUMN_COPY.in_progress.waitingOn(card({ who: "you" }))).toBe(
        "Waiting for you to carry on.",
      );
    });

    it("says a stuck card has stood still, with the limit for its column", () => {
      expect(COLUMN_COPY.in_progress.waitingOn(card({ who: "claude", stuck: true }))).toBe(
        "Nothing has changed for more than 7 days.",
      );
      expect(
        COLUMN_COPY.in_review.waitingOn(card({ prUrl: "https://example.com/pr/1", stuck: true })),
      ).toBe("Nothing has changed for more than 3 days.");
      expect(COLUMN_COPY.in_progress.whatNext(card({ stuck: true }))).toBe(
        "Check in on it, or move it back to Queue.",
      );
    });

    it("tells the owner what to do with a pull request in review", () => {
      const withPr = card({ prUrl: "https://example.com/pr/1", who: "pr_waiting" });
      expect(COLUMN_COPY.in_review.waitingOn(withPr)).toBe(
        "Waiting for your OK on the pull request.",
      );
      expect(COLUMN_COPY.in_review.whatNext(withPr)).toBe(
        "Read the pull request. Merge it if it looks good.",
      );
    });

    it("says an in-review card without a pull request waits for a look", () => {
      expect(COLUMN_COPY.in_review.waitingOn(card())).toBe(
        "Waiting for a look. No pull request is linked yet.",
      );
      expect(COLUMN_COPY.in_review.whatNext(card())).toBe(
        "Link the pull request when there is one.",
      );
    });

    it("says there is nothing left on a done card", () => {
      expect(COLUMN_COPY.done.waitingOn(card())).toBe("Nothing. This is finished.");
      expect(COLUMN_COPY.done.whatNext(card())).toBe("Nothing more to do.");
    });

    it("always answers in a full sentence", () => {
      for (const id of BOARD_COLUMNS) {
        for (const stuck of [false, true]) {
          const c = card({ stuck, who: "claude" });
          expect(COLUMN_COPY[id].waitingOn(c)).toMatch(/^[A-Z].*\.$/);
          expect(COLUMN_COPY[id].whatNext(c)).toMatch(/^[A-Z].*\.$/);
        }
      }
    });
  });
});

describe("STUCK_DAYS", () => {
  it("is 7 days for started and in progress, 3 for in review", () => {
    expect(STUCK_DAYS).toEqual({ started: 7, in_progress: 7, in_review: 3 });
  });
});

describe("MOVE_REFUSAL", () => {
  it("re-exports the refusal sentences from the move logic", () => {
    expect(MOVE_REFUSAL.has_pull_request).toBe(
      "This card has a pull request, so it counts as In review.",
    );
  });

  it("has a plain sentence for every reason, with no codes", () => {
    for (const sentence of Object.values(MOVE_REFUSAL)) {
      expect(sentence).toMatch(/^[A-Z].*\.$/);
      expect(sentence).not.toMatch(CODES);
    }
  });
});

describe("lastMoveLine", () => {
  const line = (actor: ActionActor, to: Parameters<typeof lastMoveLine>[0]["to"], ms: number) =>
    lastMoveLine({ actor, to, at: ago(ms) }, NOW);

  it("says who moved it, to where and how long ago", () => {
    expect(line("claude", "queue", 2 * DAY)).toBe("Claude moved this to Queue, 2 days ago");
    expect(line("owner", "in_review", 3 * HOUR)).toBe("You moved this to In review, 3 hours ago");
  });

  it("says a card that was only created was added, not moved", () => {
    expect(lastMoveLine({ actor: "scan", to: "backlog", at: ago(3 * DAY), added: true }, NOW)).toBe(
      "A check added this to Backlog, 3 days ago",
    );
  });

  it("words the other movers plainly", () => {
    expect(line("scan", "backlog", 5 * DAY)).toBe("A check moved this to Backlog, 5 days ago");
    expect(line("agent", "backlog", DAY)).toBe(
      "The weekly review moved this to Backlog, yesterday",
    );
    expect(line("system", "done", 9 * DAY)).toBe("Harbour moved this to Done, 9 days ago");
  });

  it("handles the short spans", () => {
    expect(line("claude", "started", 10 * 60_000)).toBe(
      "Claude moved this to Started, less than an hour ago",
    );
    expect(line("claude", "started", HOUR)).toBe("Claude moved this to Started, 1 hour ago");
    expect(line("claude", "started", 23 * HOUR)).toBe("Claude moved this to Started, 23 hours ago");
    expect(line("claude", "started", 24 * HOUR)).toBe("Claude moved this to Started, yesterday");
    expect(line("claude", "started", -HOUR)).toBe(
      "Claude moved this to Started, less than an hour ago",
    );
  });
});

describe("board screen wording", () => {
  it("heads a column's four parts in order", () => {
    expect(explainerItems(COLUMN_COPY.queue.explainer)).toEqual([
      { label: "What it means", text: COLUMN_COPY.queue.explainer.what },
      { label: "Who moves cards here", text: COLUMN_COPY.queue.explainer.whoMoves },
      { label: "What usually happens next", text: COLUMN_COPY.queue.explainer.next },
      { label: "If a card is stuck", text: COLUMN_COPY.queue.explainer.ifStuck },
    ]);
  });

  it("names a column region with its count", () => {
    expect(BOARD_TEXT.columnLabel("queue", 3)).toBe("Queue, 3 cards");
    expect(BOARD_TEXT.columnLabel("in_review", 1)).toBe("In review, 1 card");
  });

  it("announces a move by the card's title and the column's name", () => {
    expect(BOARD_TEXT.moved("Fix the title", "in_progress")).toBe(
      "Moved Fix the title to In progress",
    );
  });

  it("explains Parked in plain words with no codes", () => {
    // "Snoozed" is the plain word the snooze button uses, so only real codes are ruled out here.
    const codes = /_|\bstage\b|\bstatus\b|HARBOUR/i;
    const texts = [PARKED_COPY.short, PARKED_COPY.empty, ...Object.values(PARKED_COPY.explainer)];
    for (const text of texts) {
      expect(text).toMatch(/^[A-Z].*\.$/);
      expect(text).not.toMatch(codes);
    }
  });

  it("says the card cap in a sentence", () => {
    expect(BOARD_TEXT.truncated(200)).toBe(
      "The board shows 200 cards at most, so some are not here. Use the filters to narrow it.",
    );
  });
});

describe("Done's explainer", () => {
  it("says a problem that comes back reopens the same card, as rule sync does", () => {
    expect(COLUMN_COPY.done.explainer.ifStuck).toBe(
      "Nothing to unstick. If the problem comes back, the same card returns to Backlog.",
    );
  });
});
