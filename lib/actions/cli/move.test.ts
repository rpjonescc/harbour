import { eq } from "drizzle-orm";
import { actions, auditLog } from "@/lib/db/schema";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { BOARD_COLUMNS, boardColumn } from "../board-column";
import { MOVE_REFUSAL } from "../move-refusal";
import { actionEventsFor, insertAction } from "../store";
import { ACTION_STAGES, ACTION_STATUSES, type NewAction } from "../types";
import { parseCliArgs, USAGE } from "./args";
import { type CliDeps, runActionsCli } from "./run";

const t0 = new Date("2026-10-02T09:00:00Z");
const PRODUCTS = [{ id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com" }];
const PR = "https://github.com/acme/widget/pull/42";
const ADD = [
  "add",
  "--product",
  "acme-docs",
  "--title",
  "Hand the page titles to the docs owner",
  "--why",
  "The docs owner writes the page titles.",
  "--area",
  "SEO",
  "--impact",
  "high",
  "--effort",
  "small",
];

function setup() {
  const db = openTestDb();
  const deps: CliDeps = { db, products: PRODUCTS, timeZone: "Europe/London", now: t0 };
  let rules = 0;
  const add = (action: Partial<NewAction> = {}) =>
    insertAction(db, ruleAction({ ruleKey: `rule-${++rules}`, ...action }), "scan", null, t0);
  const run = (...argv: string[]) => runActionsCli(argv, deps);
  const row = (id: number) => db.select().from(actions).where(eq(actions.id, id)).get();
  return { db, add, run, row };
}

describe("parsing move and --column", () => {
  it("reads a move with its from column and note", () => {
    expect(
      parseCliArgs(["move", "7", "started", "--from", "queue", "--note", " Picked up "]),
    ).toEqual({ name: "move", id: 7, from: "queue", to: "started", note: "Picked up" });
  });

  it.each([
    [["move", "7", "started", "--note", "x"], "--from is required: the column you last saw"],
    [["move", "7", "started", "--from", "queue"], "--note is required"],
    [["move", "7", "doing", "--from", "queue", "--note", "x"], "Unknown column: doing"],
    [["move", "7", "started", "--from", "open", "--note", "x"], "Unknown column: open"],
    [["move", "7", "--from", "queue", "--note", "x"], "Usage: pnpm actions move"],
    [
      ["move", "7", "started", "--from", "queue", "--note", "x", "--until", "2026-10-09"],
      "--until is not an option of move",
    ],
    [["list", "--column", "queue,parked"], "Unknown column: parked"],
    [["list", "--column", "queue", "--status", "open"], "Use --status or --column, not both"],
    [[...ADD, "--column", "queue", "--status", "open"], "Use --status or --column, not both"],
    [
      [...ADD, "--column", "done"],
      "--column must be one of: backlog, queue, started, in_progress, in_review",
    ],
  ])("refuses %j", (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(message);
  });

  it("lists the columns and the move command in the usage", () => {
    expect(USAGE).toContain('pnpm actions move <id> <column> --from <column> --note "<reason>"');
    expect(USAGE).toContain("--column <c>[,<c>]");
    expect(USAGE).toContain(`Columns: ${BOARD_COLUMNS.join(", ")}`);
  });
});

describe("pnpm actions move", () => {
  it("moves the card as Claude, with the note in history", () => {
    const { db, add, run, row } = setup();
    const id = add();
    expect(run("move", String(id), "queue", "--from", "backlog", "--note", "Next up")).toEqual({
      code: 0,
      stdout: `#${id} backlog → queue\n`,
      stderr: "",
    });
    expect(row(id)).toMatchObject({ status: "open", stage: "queue" });
    expect(actionEventsFor(db, id).at(-1)).toMatchObject({
      actor: "claude",
      fromStage: null,
      toStage: "queue",
      note: "Next up",
    });
    const audit = db.select().from(auditLog).get();
    expect(audit).toMatchObject({ login: "claude", event: "action_status_changed" });
  });

  it("accepts a new idea moved out of Backlog", () => {
    const { db, run, row } = setup();
    const id = insertAction(db, agentAction(analystJob(db), "Add an FAQ"), "agent", null, t0);
    expect(run("move", String(id), "started", "--from", "backlog", "--note", "Doing it").code).toBe(
      0,
    );
    expect(row(id)).toMatchObject({ status: "in_progress", stage: "started" });
  });

  it.each([
    ["stale", "in_progress", `is no longer in in_progress: run "pnpm actions show`],
    ["same column", "backlog", MOVE_REFUSAL.same_column],
  ])("refuses a %s move with exit code 1", (_label, from, message) => {
    const { add, run } = setup();
    const id = add();
    const to = from === "backlog" ? "backlog" : "done";
    const out = run("move", String(id), to, "--from", from, "--note", "x");
    expect(out.code).toBe(1);
    expect(out.stderr).toContain(message);
  });

  it("refuses In progress for a card with a pull request, and a missing card", () => {
    const { db, add, run } = setup();
    const id = add({ status: "in_progress" });
    db.update(actions).set({ prUrl: PR }).run();
    const pr = run("move", String(id), "in_progress", "--from", "in_review", "--note", "x");
    expect(pr).toEqual({
      code: 1,
      stdout: "",
      stderr: "This card has a pull request, so it counts as In review.\n",
    });
    expect(run("move", "999", "queue", "--from", "backlog", "--note", "x").stderr).toBe(
      "Action #999 not found\n",
    );
  });

  it("shows the card's column", () => {
    const { add, run } = setup();
    const id = add({ status: "in_progress", stage: "started" });
    expect(run("show", String(id)).stdout).toContain("Column: started\n");
  });

  it("prints a stage move in the history", () => {
    const { add, run } = setup();
    const id = add();
    run("move", String(id), "queue", "--from", "backlog", "--note", "Next up");
    expect(run("show", String(id)).stdout).toContain("Claude  backlog → queue  Next up");
  });
});

describe("pnpm actions list --column", () => {
  it("lists exactly the cards boardColumn puts in the asked columns, never parked ones", () => {
    const { db, add, run, row } = setup();
    const ids: number[] = [];
    for (const status of ACTION_STATUSES) {
      for (const stage of [null, ...ACTION_STAGES]) {
        for (const prUrl of [null, PR]) {
          const snoozedUntil = status === "snoozed" ? "2026-10-09" : null;
          const id = add({ status, stage, snoozedUntil });
          // NewAction cannot carry a PR link: Claude links one after creation.
          db.update(actions).set({ prUrl }).where(eq(actions.id, id)).run();
          ids.push(id);
        }
      }
    }
    const listed = (...columns: string[]) =>
      JSON.parse(run("list", "--column", columns.join(","), "--json").stdout).actions.map(
        (a: { id: number }) => a.id,
      );
    const inColumns = (...columns: string[]) =>
      ids.filter((id) => {
        const r = row(id);
        const column = r && boardColumn(r);
        return typeof column === "string" && columns.includes(column);
      });
    for (const column of BOARD_COLUMNS) {
      expect(listed(column)).toEqual(inColumns(column));
      expect(listed(column).length).toBeGreaterThan(0);
    }
    expect(listed("queue", "done")).toEqual(inColumns("queue", "done"));
    const parked = ids.filter((id) => ["snoozed", "dismissed"].includes(row(id)?.status ?? ""));
    expect(listed(...BOARD_COLUMNS)).toEqual(ids.filter((id) => !parked.includes(id)));
  });
});

describe("pnpm actions add --column", () => {
  it.each([
    ["backlog", "open", null],
    ["queue", "open", "queue"],
    ["started", "in_progress", "started"],
    ["in_progress", "in_progress", null],
    ["in_review", "in_progress", "in_review"],
  ] as const)("creates the action already in %s", (column, status, stage) => {
    const { db, run, row } = setup();
    const out = run(...ADD, "--column", column);
    expect(out.code).toBe(0);
    expect(row(1)).toMatchObject({ status, stage });
    expect(actionEventsFor(db, 1)).toEqual([
      expect.objectContaining({ from: null, to: status, fromStage: null, toStage: stage }),
    ]);
  });

  it("keeps --status working, with no stage", () => {
    const { run, row } = setup();
    expect(run(...ADD, "--status", "in_progress").code).toBe(0);
    expect(row(1)).toMatchObject({ status: "in_progress", stage: null });
  });
});
