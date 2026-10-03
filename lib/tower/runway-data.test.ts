import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { insertAction } from "@/lib/actions/store";
import type { ContentScan } from "@/lib/content/read/scan";
import type { Db } from "@/lib/db/client";
import { actionEvents } from "@/lib/db/schema";
import { ruleAction } from "@/tests/helpers/actions";
import { coverage, times } from "@/tests/helpers/coverage";
import { openTestDb } from "@/tests/helpers/db";
import { seedScan } from "@/tests/helpers/scan-views";
import { ACME_DOCS, ago, DAY, HOUR, t0, towerConfig } from "@/tests/helpers/tower";
import { runwayFacts } from "./runway-data";

let db: Db;
let dir: string;

beforeEach(() => {
  db = openTestDb();
  dir = mkdtempSync(join(tmpdir(), "harbour-tower-runway-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const read = (content: ContentScan | null = null) =>
  runwayFacts(db, towerConfig(dir), ACME_DOCS, content, t0, null);

const indexingObservations = coverage(
  [...times(3, "indexed"), ...times(2, "crawled_not_indexed")],
  {
    total: 53,
  },
).map(({ kind, subject, value }) => ({ kind, subject, value }));

describe("runwayFacts", () => {
  it("reads a product with no checks and no work as gaps", () => {
    const facts = read();
    expect(facts).toMatchObject({
      nextAction: null,
      weekly: { seo: null, geo: null, aeo: null },
      indexing: null,
      outside: { state: "no_searches", links: null, ai: null },
      content: null,
      claudeTouchedAt: null,
    });
    expect(facts.today.scannedAt).toBeNull();
  });

  it("reads indexing from the last check, the weekly change and the next action", () => {
    seedScan(db, {
      productId: "acme-docs",
      at: ago(8 * DAY),
      totals: { seo: 50, geo: 40, aeo: 30 },
    });
    seedScan(db, {
      productId: "acme-docs",
      at: ago(3 * HOUR),
      totals: { seo: 58, geo: 40, aeo: 30 },
      runs: [{ collector: "indexing", status: "ok", observations: indexingObservations }],
    });
    insertAction(db, ruleAction({ title: "Add a sitemap" }), "scan", null, ago(DAY));
    const facts = read();
    expect(facts.indexing).toMatchObject({ state: "counted", indexed: 3, checked: 5 });
    expect(facts.weekly.seo).toEqual({ now: 58, before: 50 });
    expect(facts.nextAction?.title).toBe("Add a sitemap");
    expect(facts.today.scannedAt).toEqual(ago(3 * HOUR));
  });

  it("leaves indexing out when the last check failed", () => {
    seedScan(db, { productId: "acme-docs", at: ago(HOUR), status: "failed", scored: false });
    expect(read().indexing).toBeNull();
  });

  it("finds when Claude last changed one of the product's cards", () => {
    const id = insertAction(db, ruleAction(), "scan", null, ago(5 * DAY));
    db.insert(actionEvents)
      .values({ actionId: id, at: ago(2 * DAY), actor: "claude", from: "open", to: "in_progress" })
      .run();
    db.insert(actionEvents)
      .values({ actionId: id, at: ago(DAY), actor: "owner", from: "in_progress", to: "open" })
      .run();
    expect(read().claudeTouchedAt).toEqual(ago(2 * DAY));
    expect(db.select().from(actionEvents).where(eq(actionEvents.actionId, id)).all()).toHaveLength(
      3,
    );
  });

  it("counts this product's content only when a content read is given", () => {
    const empty: ContentScan = {
      entries: [],
      pieces: new Map(),
      capped: null,
      unreadable: [],
      folderError: false,
    };
    expect(read(empty).content).toEqual({ ready: 0, needsYou: 0, writing: 0, ideas: 0 });
  });
});
