import { eq } from "drizzle-orm";
import { actions, auditLog } from "@/lib/db/schema";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { linkPullRequest } from "./pr-link";
import { actionEventsFor, insertAction } from "./store";

const t0 = new Date("2026-10-02T09:00:00Z");
const t1 = new Date("2026-10-02T10:00:00Z");
const URL_42 = "https://github.com/acme/widget/pull/42";

function setup() {
  const db = openTestDb();
  const id = insertAction(db, ruleAction({ status: "in_progress" }), "scan", null, t0);
  const link = (url: string | null, over: { id?: number; productIds?: string[] } = {}) =>
    linkPullRequest(db, { id, url, productIds: ["acme-docs"], now: t1, ...over });
  const row = () => db.select().from(actions).where(eq(actions.id, id)).get();
  const audits = () =>
    db
      .select()
      .from(auditLog)
      .all()
      .map((e) => [e.login, e.event, e.detail]);
  return { db, id, link, row, audits };
}

describe("linkPullRequest", () => {
  it("stores the URL with a Claude history entry and an audit entry, keeping the status", () => {
    const { db, id, link, row, audits } = setup();
    expect(link(URL_42)).toEqual({ ok: true, id, prUrl: URL_42 });
    expect(row()).toMatchObject({ prUrl: URL_42, status: "in_progress", updatedAt: t1 });
    expect(row()?.statusChangedAt).toEqual(t0);
    expect(actionEventsFor(db, id).at(-1)).toMatchObject({
      actor: "claude",
      from: "in_progress",
      to: "in_progress",
      note: `Linked PR ${URL_42}`,
    });
    expect(audits()).toEqual([["claude", "action_pr_linked", { id, url: URL_42 }]]);
  });

  it("clears the link", () => {
    const { db, id, link, row, audits } = setup();
    link(URL_42);
    expect(link(null)).toEqual({ ok: true, id, prUrl: null });
    expect(row()?.prUrl).toBeNull();
    expect(actionEventsFor(db, id).at(-1)?.note).toBe("Cleared the PR link");
    expect(audits().at(-1)).toEqual(["claude", "action_pr_linked", { id, url: null }]);
  });

  it("writes nothing when the link is already that URL", () => {
    const { db, id, link, audits } = setup();
    link(URL_42);
    expect(link(URL_42)).toEqual({ ok: true, id, prUrl: URL_42 });
    expect(actionEventsFor(db, id)).toHaveLength(2);
    expect(audits()).toHaveLength(1);
  });

  it("refuses anything but a GitHub pull request URL", () => {
    const { link, row, audits } = setup();
    expect(link(`${URL_42}?tab=files`)).toEqual({ ok: false, error: "invalid_url" });
    expect(link("https://example.com/acme/widget/pull/42")).toEqual({
      ok: false,
      error: "invalid_url",
    });
    expect(row()?.prUrl).toBeNull();
    expect(audits()).toEqual([]);
  });

  it("stores the normalised URL", () => {
    const { id, link, row } = setup();
    expect(link(` ${URL_42}/ `)).toEqual({ ok: true, id, prUrl: URL_42 });
    expect(row()?.prUrl).toBe(URL_42);
  });

  it("treats a missing action or an unconfigured product as not found", () => {
    const { link, row, audits } = setup();
    expect(link(URL_42, { id: 999 })).toEqual({ ok: false, error: "not_found" });
    expect(link(URL_42, { productIds: ["acme-blog"] })).toEqual({ ok: false, error: "not_found" });
    expect(row()?.prUrl).toBeNull();
    expect(audits()).toEqual([]);
  });
});
