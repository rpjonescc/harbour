import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { columnTarget } from "./board-column";
import { loadBoard } from "./board-view";
import { insertAction } from "./store";
import { MAX_BOARD_ACTIONS } from "./views";

const PRODUCTS = [{ id: "acme-docs", name: "Acme Docs" }];
const NOW = new Date("2026-10-20T09:00:00Z");
const created = new Date(NOW.getTime() - 24 * 3_600_000);

function setup() {
  const db = openTestDb();
  return { db, load: () => loadBoard(db, { productId: null, area: null }, NOW, PRODUCTS) };
}

describe("the card cap", () => {
  it("shows at most 200 cards, flags truncation, and keeps true counts", () => {
    const { db, load } = setup();
    db.transaction((tx) => {
      for (let i = 0; i < MAX_BOARD_ACTIONS + 5; i++) {
        insertAction(
          tx,
          ruleAction({ ruleKey: `bulk-${i}`, title: `Bulk ${i}`, ...columnTarget("queue") }),
          "scan",
          null,
          created,
        );
      }
    });
    const board = load();
    expect(board.columns.queue).toHaveLength(MAX_BOARD_ACTIONS);
    expect(board.counts.queue).toBe(MAX_BOARD_ACTIONS + 5);
    expect(board.truncated).toBe(true);
  });

  it("is not truncated at exactly 200", () => {
    const { db, load } = setup();
    db.transaction((tx) => {
      for (let i = 0; i < MAX_BOARD_ACTIONS; i++) {
        insertAction(
          tx,
          ruleAction({ ruleKey: `bulk-${i}`, title: `Bulk ${i}`, ...columnTarget("queue") }),
          "scan",
          null,
          created,
        );
      }
    });
    expect(load().truncated).toBe(false);
  });

  it("gives parked cards only the room the columns leave, and flags the cut", () => {
    const { db, load } = setup();
    db.transaction((tx) => {
      for (let i = 0; i < MAX_BOARD_ACTIONS - 1; i++) {
        insertAction(
          tx,
          ruleAction({ ruleKey: `bulk-${i}`, ...columnTarget("queue") }),
          "scan",
          null,
          created,
        );
      }
    });
    for (const key of ["asleep-1", "asleep-2"]) {
      insertAction(
        db,
        ruleAction({ ruleKey: key, status: "snoozed", snoozedUntil: "2026-11-01" }),
        "scan",
        null,
        created,
      );
    }
    const board = load();
    expect(board.parked).toHaveLength(1);
    expect(board.truncated).toBe(true);
  });
});
