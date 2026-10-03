import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { insertAction } from "@/lib/actions/store";
import type { ContentScan } from "@/lib/content/read/scan";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions } from "@/lib/db/schema";
import { ruleAction } from "@/tests/helpers/actions";
import { coverage, times } from "@/tests/helpers/coverage";
import { openTestDb } from "@/tests/helpers/db";
import { seedScan } from "@/tests/helpers/scan-views";
import { ago, DAY, HOUR, PRODUCT_ROWS, t0, towerConfig } from "@/tests/helpers/tower";
import { winsFacts } from "./wins-data";

let db: Db;
let dir: string;

beforeEach(() => {
  db = openTestDb();
  dir = mkdtempSync(join(tmpdir(), "harbour-tower-wins-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const read = (content: ContentScan | null = null) =>
  winsFacts(db, towerConfig(dir), PRODUCT_ROWS, t0, content);

function done(title: string, at: Date, prUrl: string | null = null, productId = "acme-docs") {
  const id = insertAction(
    db,
    ruleAction({ title, productId, ruleKey: title }),
    "scan",
    null,
    ago(9 * DAY),
  );
  db.insert(actionEvents)
    .values({ actionId: id, at, actor: "owner", from: "open", to: "done" })
    .run();
  if (prUrl) db.update(actions).set({ prUrl }).where(eq(actions.id, id)).run();
  return id;
}

const indexed = (n: number) =>
  coverage([...times(n, "indexed"), ...times(2, "crawled_not_indexed")], { total: 40 }).map(
    ({ kind, subject, value }) => ({ kind, subject, value }),
  );

describe("winsFacts", () => {
  it("is all zeros and gaps on a fresh install, over the last seven local days", () => {
    const facts = read();
    expect(facts.doneByDay.map((d) => d.day)).toEqual([
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(facts.doneByDay.every((d) => d.count === 0 && d.withPr === 0)).toBe(true);
    expect(facts).toMatchObject({ rises: [], indexedGain: [], approvedPieces: null });
  });

  it("buckets finished cards by the owner's day, across midnight, counting each card once", () => {
    // 23:30 UTC on 1 Oct is 00:30 on 2 Oct in London; 22:30 UTC is still 1 Oct.
    done("a", new Date("2026-10-01T23:30:00Z"), "https://github.com/example/site/pull/1");
    const twice = done("b", new Date("2026-10-01T22:30:00Z"));
    db.insert(actionEvents)
      .values({
        actionId: twice,
        at: new Date("2026-10-01T22:40:00Z"),
        actor: "owner",
        from: "open",
        to: "done",
      })
      .run();
    done("c", new Date("2026-09-25T12:00:00Z")); // before the week
    done("d", ago(HOUR), null, "other"); // not a configured product
    const byDay = Object.fromEntries(read().doneByDay.map((d) => [d.day, [d.count, d.withPr]]));
    expect(byDay["2026-10-02"]).toEqual([1, 1]);
    expect(byDay["2026-10-01"]).toEqual([1, 0]);
    expect(byDay["2026-09-26"]).toEqual([0, 0]);
  });

  it("reads score rises against a week ago", () => {
    seedScan(db, {
      productId: "acme-docs",
      at: ago(8 * DAY),
      totals: { seo: 52, geo: 40, aeo: 30 },
    });
    seedScan(db, { productId: "acme-docs", at: ago(HOUR), totals: { seo: 58, geo: 38, aeo: 30 } });
    expect(read().rises).toEqual([{ productId: "acme-docs", area: "seo", from: 52, to: 58 }]);
  });

  it("reads pages newly in Google only when both counts are known", () => {
    const ok = (n: number) => [
      { collector: "indexing", status: "ok" as const, observations: indexed(n) },
    ];
    seedScan(db, { productId: "acme-docs", at: ago(8 * DAY), runs: ok(3) });
    seedScan(db, { productId: "acme-docs", at: ago(HOUR), runs: ok(7) });
    seedScan(db, { productId: "acme-blog", at: ago(8 * DAY) }); // no indexing then
    seedScan(db, { productId: "acme-blog", at: ago(HOUR), runs: ok(5) });
    expect(read().indexedGain).toEqual([{ productId: "acme-docs", from: 3, to: 7 }]);
  });

  it("counts approved pieces only when content is on", () => {
    const empty: ContentScan = {
      entries: [],
      pieces: new Map(),
      capped: null,
      unreadable: [],
      folderError: false,
    };
    expect(read(empty).approvedPieces).toBe(0);
    expect(read({ ...empty, folderError: true }).approvedPieces).toBeNull();
  });
});
