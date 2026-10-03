import { readFileSync } from "node:fs";
import { externalChecks } from "@/lib/db/schema";
import type { Observation } from "@/lib/scan/types";
import { openTestDb } from "@/tests/helpers/db";
import { KEEP_DAYS, pruneExternalChecks, readChecks, saveExternalChecks } from "./store";

const DAY = 24 * 60 * 60_000;
const NOW = new Date("2026-10-04T06:00:00Z");
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

const backlinks = (daysAgo = 0, n = 4): Observation => ({
  kind: "backlinks",
  subject: "docs.example.com",
  value: {
    referringDomains: n,
    backlinks: 10,
    dofollow: 5,
    rank: null,
    provider: "serpstat",
    checkedAt: at(daysAgo),
  },
});
const serp = (query: string, position: number | null, daysAgo = 0): Observation => ({
  kind: "serp_rank",
  subject: query,
  value: { query, position, url: null, topDomains: [], checkedAt: at(daysAgo) },
});
const ai = (question: string, daysAgo = 0): Observation => ({
  kind: "ai_answer",
  subject: question,
  value: {
    question,
    named: false,
    cited: false,
    citedDomains: [],
    businessesNamed: null,
    checkedAt: at(daysAgo),
  },
});
const save = (db: ReturnType<typeof openTestDb>, observations: Observation[]) =>
  saveExternalChecks(db, { productId: "acme-docs", scanId: 7, jobId: 9, observations });

describe("saveExternalChecks", () => {
  it("writes each valid check with its scan and job, and ignores the tally and other kinds", () => {
    const db = openTestDb();
    const result = save(db, [
      backlinks(),
      serp("acme docs", 3),
      ai("Who is Acme?"),
      { kind: "treg_summary", subject: "docs.example.com", value: { whatever: true } },
      { kind: "page", subject: "https://docs.example.com/", value: {} },
    ]);
    expect(result).toEqual({ written: 3, alreadyKept: 0, dropped: 0 });
    const rows = db.select().from(externalChecks).all();
    expect(rows.map((r) => [r.productId, r.kind, r.subject, r.scanId, r.jobId])).toEqual([
      ["acme-docs", "backlinks", "docs.example.com", 7, 9],
      ["acme-docs", "serp_rank", "acme docs", 7, 9],
      ["acme-docs", "ai_answer", "Who is Acme?", 7, 9],
    ]);
    expect(rows[0]?.checkedAt).toEqual(NOW);
  });

  it("is idempotent: the same observation twice is kept once", () => {
    const db = openTestDb();
    save(db, [backlinks(), serp("q one", 2)]);
    expect(save(db, [backlinks(), serp("q one", 2)])).toEqual({
      written: 0,
      alreadyKept: 2,
      dropped: 0,
    });
    expect(db.select().from(externalChecks).all()).toHaveLength(2);
  });

  it("keeps a later check of the same subject beside the earlier one", () => {
    const db = openTestDb();
    save(db, [serp("q one", 5, 7)]);
    expect(save(db, [serp("q one", 3, 0)]).written).toBe(1);
    expect(db.select().from(externalChecks).all()).toHaveLength(2);
  });

  it("drops and counts anything that fails its shape or limits", () => {
    const db = openTestDb();
    const good = backlinks();
    const result = save(db, [
      { ...good, value: { ...good.value, referringDomains: -1 } },
      { ...good, value: { ...good.value, checkedAt: "yesterday" } },
      { ...good, subject: "" },
      { ...good, subject: "d".repeat(201) },
      { ...serp("q one", 31) },
      { ...serp("q one", 0) },
      { ...serp("q one", 3), subject: "a different search" },
      { ...ai("Who?"), value: { question: "Who?", named: "yes" } },
      { ...ai("Who?"), subject: "Whom?" },
      { kind: "backlinks", subject: "x", value: "nope" as never },
      backlinks(0, 6),
    ]);
    expect(result).toEqual({ written: 1, alreadyKept: 0, dropped: 10 });
    expect(db.select().from(externalChecks).all()).toHaveLength(1);
  });

  it("keeps only the fields of each shape", () => {
    const db = openTestDb();
    const withExtra = { ...backlinks(1), value: { ...backlinks(1).value, secret: "SENTINEL" } };
    save(db, [withExtra]);
    const stored = JSON.stringify(db.select().from(externalChecks).all());
    expect(stored).not.toContain("SENTINEL");
  });
});

describe("pruneExternalChecks", () => {
  it("deletes checks older than 400 days and keeps the rest", () => {
    const db = openTestDb();
    save(db, [
      backlinks(KEEP_DAYS + 1),
      backlinks(KEEP_DAYS - 1),
      serp("q one", 4, KEEP_DAYS + 30),
      backlinks(0),
    ]);
    expect(pruneExternalChecks(db, NOW)).toBe(2);
    expect(db.select().from(externalChecks).all()).toHaveLength(2);
    expect(pruneExternalChecks(db, NOW)).toBe(0);
  });
});

describe("readChecks", () => {
  it("reads one product's checks of a kind, newest first, within the window", () => {
    const db = openTestDb();
    save(db, [serp("a", 3, 14), serp("a", 2, 0), serp("a", 5, 90), serp("b", 1, 7)]);
    saveExternalChecks(db, {
      productId: "other",
      scanId: null,
      jobId: null,
      observations: [serp("a", 1, 0)],
    });
    const rows = readChecks(db, "acme-docs", "serp_rank", 60, NOW);
    expect(rows.map((r) => [r.subject, r.value.position])).toEqual([
      ["a", 2],
      ["b", 1],
      ["a", 3],
    ]);
  });

  it("skips a row that no longer passes its shape", () => {
    const db = openTestDb();
    save(db, [serp("a", 2)]);
    db.insert(externalChecks)
      .values({
        productId: "acme-docs",
        kind: "serp_rank",
        subject: "bad",
        checkedAt: NOW,
        value: { query: "bad", position: 99 },
      })
      .run();
    expect(readChecks(db, "acme-docs", "serp_rank", 60, NOW).map((r) => r.subject)).toEqual(["a"]);
  });

  it("is enforced by the table too: an unknown kind or an oversized subject is refused", () => {
    const db = openTestDb();
    const row = { productId: "p", checkedAt: NOW, value: {} };
    expect(() =>
      db
        .insert(externalChecks)
        .values({ ...row, kind: "rank", subject: "x" })
        .run(),
    ).toThrow();
    expect(() =>
      db
        .insert(externalChecks)
        .values({ ...row, kind: "backlinks", subject: "x".repeat(201) })
        .run(),
    ).toThrow();
  });
});

describe("the migration", () => {
  it("only creates: nothing existing is altered, so a backup restores either way", () => {
    const sql = readFileSync("drizzle/0013_external_checks.sql", "utf8");
    const statements = sql.split("--> statement-breakpoint").map((part) => part.trim());
    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).toMatch(/^CREATE (UNIQUE INDEX|INDEX|TABLE) `external_checks/);
    }
    expect(sql).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE)\b/i);
  });
});

describe("hygiene of what is kept", () => {
  const cited = (domains: string[]): Observation => {
    const base = ai("Who is Acme?");
    return { ...base, value: { ...base.value, citedDomains: domains } };
  };

  it.each([
    ["a bidi override", "evil\u202emoc.example"],
    ["a null character", "a\u0000b.example"],
    ["a zero-width space", "a\u200bb.example"],
    ["an uppercase or spaced name", "Not A Host.example"],
    ["a path", "example.org/page"],
    ["an empty host", ""],
  ])("drops an answer whose cited domain has %s", (_name, domain) => {
    const db = openTestDb();
    expect(save(db, [cited([domain])])).toEqual({ written: 0, alreadyKept: 0, dropped: 1 });
    const top = serp("q one", 2);
    expect(save(db, [{ ...top, value: { ...top.value, topDomains: [domain] } }]).dropped).toBe(1);
    expect(db.select().from(externalChecks).all()).toEqual([]);
  });

  it.each([
    ["a bidi override", "who\u202e is it?"],
    ["a null character", "a\u0000b"],
    ["a zero-width space", "a\u200bb"],
    ["a line break", "a\nb"],
    ["a tab", "a\tb"],
  ])("drops a question or search with %s", (_name, text) => {
    const db = openTestDb();
    expect(save(db, [ai(text), serp(text, 3)])).toEqual({ written: 0, alreadyKept: 0, dropped: 2 });
  });

  it("drops a links check whose subject is not a host name", () => {
    const db = openTestDb();
    const good = backlinks();
    expect(
      save(db, [
        { ...good, subject: "docs.example.com\u202e" },
        { ...good, subject: "Docs Example" },
      ]).dropped,
    ).toBe(2);
  });

  it("keeps plain accented text and a real host", () => {
    const db = openTestDb();
    expect(
      save(db, [ai("Où trouver un café à Brisbane?"), cited(["news.example.org"])]).written,
    ).toBe(2);
  });
});
