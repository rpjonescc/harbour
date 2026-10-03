import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { card, fakeGh, PRODUCT_IDS, prJson, setup } from "@/tests/helpers/pr-sync";
import { moveToColumn } from "../move-to-column";
import type { GhRunner } from "./gh";

const pr = (n: number) => `https://github.com/acme/widget/pull/${n}`;
const CLOSED = prJson({ state: "CLOSED" });

describe("syncPullRequests: failures are reported, never success", () => {
  it("reports a pull request gh cannot find and carries on with the next card", async () => {
    const { db, column, sync } = setup();
    const lost = card(db, "in_review", pr(1), "Lost work");
    const closed = card(db, "in_review", pr(2), "Closed work");
    const report = await sync(fakeGh({ [pr(2)]: CLOSED }).gh);
    expect(report.outcomes).toEqual([
      expect.objectContaining({ id: lost, result: "failed", reason: "not_found" }),
      expect.objectContaining({ id: closed, result: "moved", to: "backlog" }),
    ]);
    expect(column(lost)).toBe("in_review");
  });

  it.each([["gh_missing"], ["not_logged_in"], ["rate_limited"]] as const)(
    "stops calling gh after %s and fails every card with it",
    async (kind) => {
      const { db, sync } = setup();
      card(db, "in_review", pr(1), "First work");
      card(db, "in_review", pr(2), "Second work");
      const fake = fakeGh({ [pr(1)]: { ok: false, kind, detail: "" }, [pr(2)]: CLOSED });
      const report = await sync(fake.gh);
      expect(fake.calls).toHaveLength(1);
      expect(report.outcomes.map((o) => o.result === "failed" && o.reason)).toEqual([kind, kind]);
    },
  );

  it("reports an answer it cannot read", async () => {
    const { db, sync } = setup();
    card(db, "in_review", pr(1), "Odd work");
    const report = await sync(fakeGh({ [pr(1)]: "{not json" }).gh);
    expect(report.outcomes[0]).toMatchObject({ result: "failed", reason: "unreadable" });
    const shapeless = await sync(fakeGh({ [pr(1)]: JSON.stringify({ state: "WHO" }) }).gh);
    expect(shapeless.outcomes[0]).toMatchObject({ result: "failed", reason: "unreadable" });
  });

  it("reports a stored link that is not a pull request, without calling gh", async () => {
    const { db, sync } = setup();
    const id = card(db, "in_review", pr(1), "Odd link");
    db.update(actions).set({ prUrl: "https://example.com/x" }).where(eq(actions.id, id)).run();
    const fake = fakeGh({});
    const report = await sync(fake.gh);
    expect(fake.calls).toEqual([]);
    expect(report.outcomes[0]).toMatchObject({ result: "failed", reason: "bad_link" });
  });

  it("does not overwrite a card moved while gh was answering (compare-and-set)", async () => {
    const { db, column, sync } = setup();
    const id = card(db, "in_review", pr(1), "Racing work");
    const gh: GhRunner = async (args) => {
      moveToColumn(db, {
        id,
        from: "in_review",
        to: "started",
        actor: "owner",
        login: "owner@example.com",
        productIds: PRODUCT_IDS,
      });
      return fakeGh({ [pr(1)]: CLOSED }).gh(args);
    };
    const report = await sync(gh);
    expect(column(id)).toBe("started");
    expect(report.outcomes[0]).toMatchObject({ result: "failed", reason: "moved_meanwhile" });
  });
});

describe("syncPullRequests: bounded", () => {
  it("checks at most maxCards cards and counts the rest", async () => {
    const { db, sync } = setup();
    for (const n of [1, 2, 3]) card(db, "in_review", pr(n), `Work number ${n}`);
    const fake = fakeGh({ [pr(1)]: prJson(), [pr(2)]: prJson(), [pr(3)]: prJson() });
    const report = await sync(fake.gh, { maxCards: 2 });
    expect(fake.calls).toHaveLength(2);
    expect(report.more).toBe(1);
  });

  it("stops at the time limit and reports the cards it did not reach", async () => {
    const { db, sync } = setup();
    for (const n of [1, 2]) card(db, "in_review", pr(n), `Work number ${n}`);
    let ms = 0;
    const slow: GhRunner = async (args) => {
      ms += 1000;
      return fakeGh({ [pr(1)]: prJson(), [pr(2)]: prJson() }).gh(args);
    };
    const report = await sync(slow, { timeLimitMs: 1000, clock: () => ms });
    expect(report.outcomes.map((o) => o.result)).toEqual(["unchanged", "failed"]);
    expect(report.outcomes[1]).toMatchObject({ reason: "out_of_time" });
  });
});
