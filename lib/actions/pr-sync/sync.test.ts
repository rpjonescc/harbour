import { auditLog } from "@/lib/db/schema";
import { PR_SYNC_NOTE } from "@/lib/explain/pr-sync";
import { card, failing, fakeGh, passing, prJson, setup } from "@/tests/helpers/pr-sync";
import { actionEventsFor } from "../store";

const PR = "https://github.com/acme/widget/pull/12";
const MERGED = prJson({ state: "MERGED", mergedAt: "2026-10-03T15:00:00Z" });
const CLOSED = prJson({ state: "CLOSED", closedAt: "2026-10-03T15:00:00Z" });
const OPEN = prJson();
const DRAFT = prJson({ isDraft: true });

describe("syncPullRequests: the rules", () => {
  it("moves a merged pull request's card to Done with the merge date", async () => {
    const { db, column, notes, sync } = setup();
    const id = card(db, "in_review", PR, "Merged work");
    const report = await sync(fakeGh({ [PR]: MERGED }).gh);
    expect(column(id)).toBe("done");
    expect(notes(id).at(-1)).toBe("Pull request merged on 3 October 2026.");
    expect(report.outcomes).toEqual([
      expect.objectContaining({ id, result: "moved", from: "in_review", to: "done" }),
    ]);
    expect(actionEventsFor(db, id).at(-1)?.actor).toBe("claude");
    expect(db.select().from(auditLog).all().at(-1)).toMatchObject({ login: "claude" });
  });

  it.each([["backlog"], ["queue"], ["started"]] as const)(
    "moves an open pull request's card from %s to In review",
    async (from) => {
      const { db, column, notes, sync } = setup();
      const id = card(db, from, PR, "Open work");
      await sync(fakeGh({ [PR]: OPEN }).gh);
      expect(column(id)).toBe("in_review");
      expect(notes(id).at(-1)).toBe(PR_SYNC_NOTE.open);
    },
  );

  it("leaves a card already In review alone for an open pull request", async () => {
    const { db, column, notes, sync } = setup();
    const id = card(db, "in_review", PR, "Open work");
    const before = notes(id);
    const report = await sync(fakeGh({ [PR]: OPEN }).gh);
    expect(column(id)).toBe("in_review");
    expect(notes(id)).toEqual(before);
    expect(report.outcomes[0]?.result).toBe("unchanged");
  });

  it.each([
    ["backlog", "started"],
    ["queue", "started"],
    ["started", "started"],
    ["in_review", "in_review"],
  ] as const)("a draft pull request takes a card in %s to %s", async (from, to) => {
    const { db, column, sync } = setup();
    const id = card(db, from, PR, "Draft work");
    await sync(fakeGh({ [PR]: DRAFT }).gh);
    expect(column(id)).toBe(to);
  });

  it("moves a card whose pull request closed unmerged to Backlog and keeps the link", async () => {
    const { db, column, notes, sync } = setup();
    const id = card(db, "in_review", PR, "Closed work");
    await sync(fakeGh({ [PR]: CLOSED }).gh);
    expect(column(id)).toBe("backlog");
    expect(notes(id).at(-1)).toBe(
      "Pull request closed without merging; the card needs a decision.",
    );
    const row = db.query.actions.findFirst();
    expect((await row)?.prUrl).toBe(PR);
  });

  it("notes failing checks once, and passing checks once when they recover", async () => {
    const { db, column, notes, sync } = setup();
    const id = card(db, "in_review", PR, "Checked work");
    const count = (note: string) => notes(id).filter((n) => n === note).length;
    await sync(fakeGh({ [PR]: prJson({ statusCheckRollup: failing }) }).gh);
    await sync(fakeGh({ [PR]: prJson({ statusCheckRollup: failing }) }).gh);
    expect(count(PR_SYNC_NOTE.checksFailing)).toBe(1);
    expect(column(id)).toBe("in_review");
    await sync(fakeGh({ [PR]: prJson({ statusCheckRollup: passing }) }).gh);
    await sync(fakeGh({ [PR]: prJson({ statusCheckRollup: passing }) }).gh);
    expect(count(PR_SYNC_NOTE.checksPassing)).toBe(1);
    await sync(fakeGh({ [PR]: prJson({ statusCheckRollup: failing }) }).gh);
    expect(count(PR_SYNC_NOTE.checksFailing)).toBe(2);
  });

  it("says nothing about checks that pass without having failed", async () => {
    const { db, notes, sync } = setup();
    const id = card(db, "in_review", PR, "Checked work");
    const before = notes(id);
    await sync(fakeGh({ [PR]: prJson({ statusCheckRollup: passing }) }).gh);
    expect(notes(id)).toEqual(before);
  });

  it("moves and notes failing checks in one run", async () => {
    const { db, column, notes, sync } = setup();
    const id = card(db, "started", PR, "Checked work");
    const report = await sync(fakeGh({ [PR]: prJson({ statusCheckRollup: failing }) }).gh);
    expect(column(id)).toBe("in_review");
    expect(notes(id).slice(-2)).toEqual([PR_SYNC_NOTE.open, PR_SYNC_NOTE.checksFailing]);
    expect(report.outcomes[0]).toMatchObject({
      result: "moved",
      notes: [PR_SYNC_NOTE.open, PR_SYNC_NOTE.checksFailing],
    });
  });
});

describe("syncPullRequests: what it never touches", () => {
  it("skips cards without a link, and done, snoozed and dismissed cards, without calling gh", async () => {
    const { db, column, sync } = setup();
    const plain = card(db, "queue", null, "No pull request");
    const done = card(db, "done", PR, "Already done");
    const snoozed = card(db, "snoozed", PR, "Snoozed work");
    const fake = fakeGh({ [PR]: CLOSED });
    const report = await sync(fake.gh);
    expect(fake.calls).toEqual([]);
    expect(report.outcomes).toEqual([]);
    expect([column(plain), column(done), column(snoozed)]).toEqual(["queue", "done", null]);
  });

  it("never accepts a new idea: it is held for the owner, and gh is not asked", async () => {
    const { db, column, notes, sync } = setup();
    const id = card(db, "suggested", PR, "A new idea");
    const before = notes(id);
    const fake = fakeGh({ [PR]: MERGED });
    const report = await sync(fake.gh);
    expect(fake.calls).toEqual([]);
    expect(column(id)).toBe("backlog");
    expect(notes(id)).toEqual(before);
    expect(report.outcomes[0]).toMatchObject({ result: "held", reason: "new_idea" });
  });
});

describe("syncPullRequests: idempotent and respectful of later moves", () => {
  it("changes nothing on a second run", async () => {
    const { db, notes, sync } = setup();
    const ids = [
      card(db, "in_review", PR, "Merged work"),
      card(db, "queue", "https://github.com/acme/widget/pull/13", "Open work"),
      card(db, "started", "https://github.com/acme/widget/pull/14", "Closed work"),
    ];
    const fake = fakeGh({
      [PR]: MERGED,
      "https://github.com/acme/widget/pull/13": prJson({ statusCheckRollup: failing }),
      "https://github.com/acme/widget/pull/14": CLOSED,
    });
    await sync(fake.gh);
    const after = ids.map(notes);
    const audits = db.select().from(auditLog).all().length;
    const second = await sync(fake.gh);
    expect(ids.map(notes)).toEqual(after);
    expect(db.select().from(auditLog).all()).toHaveLength(audits);
    expect(second.outcomes.map((o) => o.result)).toEqual(["unchanged", "unchanged"]);
  });

  it("holds a card moved by hand after the sync moved it, instead of moving it back", async () => {
    const { db, column, sync } = setup();
    const id = card(db, "in_review", PR, "Closed work");
    await sync(fakeGh({ [PR]: CLOSED }).gh);
    const { moveToColumn } = await import("../move-to-column");
    moveToColumn(db, {
      id,
      from: "backlog",
      to: "queue",
      actor: "owner",
      login: "owner@example.com",
      productIds: ["acme-docs"],
    });
    const report = await sync(fakeGh({ [PR]: CLOSED }).gh);
    expect(column(id)).toBe("queue");
    expect(report.outcomes[0]).toMatchObject({
      result: "held",
      reason: "moved_by_hand",
      wanted: "backlog",
    });
  });
});

describe("syncPullRequests --dry-run", () => {
  it("reports the moves and notes it would make and writes nothing", async () => {
    const { db, column, notes, sync } = setup();
    const id = card(db, "started", PR, "Checked work");
    const before = notes(id);
    const audits = db.select().from(auditLog).all().length;
    const fake = fakeGh({ [PR]: prJson({ statusCheckRollup: failing }) });
    const report = await sync(fake.gh, { dryRun: true });
    expect(report).toMatchObject({ dryRun: true });
    expect(report.outcomes[0]).toMatchObject({ result: "moved", to: "in_review" });
    expect(column(id)).toBe("started");
    expect(notes(id)).toEqual(before);
    expect(db.select().from(auditLog).all()).toHaveLength(audits);
  });
});
