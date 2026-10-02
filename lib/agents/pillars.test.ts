import { openTestDb } from "@/tests/helpers/db";
import { approvedPillars, MAX_APPROVED_PILLARS, pillarLimitReached } from "./pillars";
import { decideProposal, importProposals, listProposals, parseProposals } from "./proposals";

const none = { keywords: [], questions: [], competitors: [] };
const pillar = (key: string) => ({
  key,
  name: key.toUpperCase(),
  description: "Short paths from sign-up to a live page.",
  why: "New teams ask this first.",
});
const seed = (keys: string[]) => {
  const db = openTestDb();
  // One proposals file holds at most five pillars.
  for (let i = 0; i < keys.length; i += 5) {
    const pillars = keys.slice(i, i + 5).map(pillar);
    importProposals(db, "acme-docs", parseProposals(JSON.stringify({ ...none, pillars })), null);
  }
  return db;
};
const ids = (db: ReturnType<typeof openTestDb>) =>
  listProposals(db, "acme-docs").pillar.map((p) => p.id);

describe("approvedPillars", () => {
  it("returns only approved pillars, oldest first", () => {
    const db = seed(["getting-started", "tips", "deploys"]);
    const [first, , third] = ids(db);
    decideProposal(db, "acme-docs", third ?? 0, "approved");
    decideProposal(db, "acme-docs", first ?? 0, "approved");
    expect(approvedPillars(db, "acme-docs").map((p) => p.key)).toEqual([
      "getting-started",
      "deploys",
    ]);
    expect(MAX_APPROVED_PILLARS).toBe(6);
  });
});

describe("pillarLimitReached", () => {
  it("stops a seventh approval, one by one and all at once, and counts a rejected one as new", () => {
    const db = seed(["a", "b", "c", "d", "e", "f"]);
    for (const id of ids(db)) decideProposal(db, "acme-docs", id, "approved");
    importProposals(
      db,
      "acme-docs",
      parseProposals(JSON.stringify({ ...none, pillars: [pillar("g")] })),
      null,
    );
    const seventh = ids(db).at(-1) ?? 0;
    expect(pillarLimitReached(db, "acme-docs", { action: "approve", proposalId: seventh })).toBe(
      true,
    );
    expect(pillarLimitReached(db, "acme-docs", { action: "approve-all", type: "pillar" })).toBe(
      true,
    );
    decideProposal(db, "acme-docs", ids(db)[0] ?? 0, "rejected");
    expect(pillarLimitReached(db, "acme-docs", { action: "approve", proposalId: seventh })).toBe(
      false,
    );
    decideProposal(db, "acme-docs", seventh, "approved");
    const rejected = ids(db)[0] ?? 0;
    expect(pillarLimitReached(db, "acme-docs", { action: "approve", proposalId: rejected })).toBe(
      true,
    );
  });
});
