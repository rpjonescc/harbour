import { eq } from "drizzle-orm";
import { actions, auditLog } from "@/lib/db/schema";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { latestStatusChange } from "../status-actor";
import { actionEventsFor, insertAction } from "../store";
import { MAX_NOTE, parseCliArgs } from "./args";
import { type CliDeps, runActionsCli } from "./run";

const t0 = new Date("2026-10-02T09:00:00Z");
const later = new Date("2026-10-02T10:00:00Z");
const PRODUCTS = [{ id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com" }];

function setup() {
  const db = openTestDb();
  const deps: CliDeps = { db, products: PRODUCTS, timeZone: "Europe/London", now: later };
  const id = insertAction(
    db,
    ruleAction({ status: "in_progress", stage: null }),
    "owner",
    null,
    t0,
  );
  const run = (...argv: string[]) => runActionsCli(argv, deps);
  const row = () => db.select().from(actions).where(eq(actions.id, id)).get();
  return { db, id, run, row };
}

describe("pnpm actions note", () => {
  it("reads a note with its id", () => {
    expect(parseCliArgs(["note", "7", "--note", " PR closed unmerged "])).toEqual({
      name: "note",
      id: 7,
      note: "PR closed unmerged",
    });
  });

  it.each([
    [["note", "7"], "--note is required"],
    [["note", "--note", "x"], "Usage: pnpm actions note"],
    [["note", "7", "8", "--note", "x"], "Usage: pnpm actions note"],
    [["note", "7", "--note", "x", "--from", "open"], "--from is not an option of note"],
    [["note", "7", "--note", "x".repeat(MAX_NOTE + 1)], `at most ${MAX_NOTE} characters`],
  ])("refuses %j plainly", (argv, message) => {
    const { run } = setup();
    const result = run(...argv);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(message);
  });

  it("records the note as Claude and leaves the card where it is", () => {
    const { db, id, run, row } = setup();
    const before = row();
    const result = run("note", String(id), "--note", "The pull request was closed unmerged.");
    expect(result).toEqual({
      code: 0,
      stdout: `#${id} note added; the card stays where it is\n`,
      stderr: "",
    });
    const after = row();
    expect(after?.status).toBe("in_progress");
    expect(after?.stage).toBe(before?.stage);
    expect(after?.statusChangedAt).toEqual(before?.statusChangedAt);
    const events = actionEventsFor(db, id);
    expect(events.at(-1)).toMatchObject({
      actor: "claude",
      from: "in_progress",
      to: "in_progress",
      fromStage: null,
      toStage: null,
      note: "The pull request was closed unmerged.",
      at: later,
    });
    // Never read as a move: the owner still made the latest status change.
    expect(latestStatusChange(events)?.actor).toBe("owner");
    const audits = db.select().from(auditLog).all();
    expect(audits.at(-1)).toMatchObject({ login: "claude", event: "action_noted" });
    expect(run("show", String(id)).stdout).toContain("The pull request was closed unmerged.");
  });

  it("refuses an unknown id or another product's card plainly", () => {
    const { db, run } = setup();
    expect(run("note", "999", "--note", "x")).toEqual({
      code: 1,
      stdout: "",
      stderr: "Action #999 not found\n",
    });
    const other = insertAction(db, ruleAction({ productId: "other" }), "scan", null, t0);
    expect(run("note", String(other), "--note", "x").stderr).toBe(`Action #${other} not found\n`);
    expect(actionEventsFor(db, other)).toHaveLength(1);
  });
});
