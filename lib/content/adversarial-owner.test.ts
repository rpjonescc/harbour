import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { readPieces } from "@/lib/content/read/pieces";
import { auditLog } from "@/lib/db/schema";
import { listJobs } from "@/lib/jobs/queue";
import { chain, expectNothingApproved, IDEA_ID, type Setup } from "@/tests/helpers/adversarial";
import { ACME, CHAIN_WORKS } from "@/tests/helpers/content";
import { claim } from "@/tests/helpers/run-job";
import { requestContent } from "./request";
import { runContentDecision } from "./worker/decision-job";

// Spec §13's adversarial fixtures about the owner: an edit made while an agent runs, and approval
// that only the owner can give. The rest are in adversarial.test.ts, adversarial-guards.test.ts
// and adversarial-screen.test.ts.

describe("the owner edits a file while an agent works on it", () => {
  const editDuring =
    (stepLine: string, path: string, edit: (text: string) => string) => (s: Setup) => {
      const run = s.deps.run;
      s.deps.run = async (o) => {
        const out = await run(o);
        if (o.stdin?.includes(stepLine)) {
          const file = join(s.brain.root, path);
          writeFileSync(file, edit(readFileSync(file, "utf8")));
        }
        return out;
      };
    };

  it("a piece edited during a check is never overwritten, and the chain stops there", async () => {
    const r = await chain(
      CHAIN_WORKS,
      editDuring(
        "STEP: gate:humanizer:1",
        contentPaths.piece(IDEA_ID, "x"),
        (t) => `${t.trimEnd()}\n\nOwner edit.\n`,
      ),
    );
    try {
      expect(r.jobs).toEqual([
        "draft:ok",
        "atomise:ok",
        "gate:no-ai-slop:1:ok",
        "gate:humanizer:1:failed",
      ]);
      expect(listJobs(r.s.deps.db, 5)[0]?.error).toMatch(/changed while it was being checked/);
      expect(
        readFileSync(join(r.s.brain.root, contentPaths.piece(IDEA_ID, "x")), "utf8"),
      ).toContain("Owner edit.");
      expect(r.piece("x").gates.map((g) => g.gate)).toEqual(["no-ai-slop"]);
    } finally {
      r.s.cleanup();
    }
  });

  it("an idea edited during the draft is never overwritten, and no piece is made", async () => {
    const r = await chain(
      CHAIN_WORKS,
      editDuring("STEP: draft", `content/ideas/acme-docs/${IDEA_ID}.md`, (t) => `${t}\nMy edit.\n`),
    );
    try {
      expect(r.jobs).toEqual(["draft:failed"]);
      expect(listJobs(r.s.deps.db, 5)[0]?.error).toBe(
        "The idea changed while it was being written, so Harbour saved nothing.",
      );
      expect(
        readFileSync(join(r.s.brain.root, `content/ideas/acme-docs/${IDEA_ID}.md`), "utf8"),
      ).toContain("My edit.");
      expect(r.pieces).toEqual([]);
    } finally {
      r.s.cleanup();
    }
  });
});

describe("approval is the owner's alone", () => {
  const OWNER = "owner@example.com";
  const config = {
    HARBOUR_CONTENT: "on",
    HARBOUR_TIMEZONE: "Europe/London",
    HARBOUR_CONTENT_DAILY_RUNS: 24,
  } as never;
  const decisions = (s: Setup) =>
    listJobs(s.deps.db, 50).filter((j) => j.kind === "content-decision");

  it("a whole chain, hostile or not, queues no decision, audits none, and leaves every piece unapproved", async () => {
    const r = await chain(CHAIN_WORKS);
    try {
      expect(r.pieces.map((p) => p.front.state)).toEqual(Array(PLATFORMS.length).fill("ready"));
      expect(decisions(r.s)).toEqual([]);
      expect(
        r.s.deps.db
          .select()
          .from(auditLog)
          .all()
          .map((e) => e.event),
      ).not.toContain("content_decided");
      expectNothingApproved(r);
    } finally {
      r.s.cleanup();
    }
  });

  it("an agent that writes an approved piece and its export itself fails the run and leaves the brain clean", async () => {
    const strays = {
      [contentPaths.piece(IDEA_ID, "linkedin")]: "---\nstate: approved\n---\nApproved by me.\n",
      [contentPaths.approved("linkedin", "2026-10-01", "docs")]: "Exported by the agent.\n",
    };
    const r = await chain(CHAIN_WORKS, undefined, { strays });
    try {
      expect(r.jobs).toEqual(["draft:failed"]);
      expect(r.pieces).toEqual([]);
      expect(r.s.brain.git("status", "--porcelain").trim()).toBe("");
      expectNothingApproved(r);
    } finally {
      r.s.cleanup();
    }
  });

  it("only the owner's request, for the revision they saw, becomes an approval, and only the worker's decision job applies it", async () => {
    const r = await chain(CHAIN_WORKS);
    try {
      const ctx = {
        db: r.s.deps.db,
        config,
        login: OWNER,
        now: new Date(),
        root: r.s.brain.root,
        products: [ACME],
      };
      const body = {
        action: "approve" as const,
        pieceId: `${IDEA_ID}.linkedin`,
        checkedFlags: [],
        confirmOpen: false,
      };
      expect(requestContent(ctx, { ...body, revision: 99 })).toMatchObject({
        ok: false,
        error: "stale",
      });
      expect(decisions(r.s)).toEqual([]);
      expect(
        requestContent(ctx, { ...body, revision: r.piece("linkedin").front.revision }),
      ).toMatchObject({ ok: true });
      expect(decisions(r.s)).toMatchObject([{ requestedBy: OWNER, status: "queued" }]);
      expect(
        r.s.deps.db
          .select()
          .from(auditLog)
          .all()
          .map((e) => e.event),
      ).toContain("content_decided");
      // Still Ready: asking does not approve; the worker's job does.
      expect(
        readPieces(r.s.brain.root, IDEA_ID).pieces.find((p) => p.platform === "linkedin")?.front
          .state,
      ).toBe("ready");
      runContentDecision(
        {
          enabled: true,
          db: r.s.deps.db,
          root: r.s.brain.root,
          quarantineRoot: join(r.s.brain.remote, "..", "quarantine"),
          products: [ACME],
          now: () => new Date(),
          timeZone: "Europe/London",
        },
        claim(r.s.deps),
      );
      const approved = readPieces(r.s.brain.root, IDEA_ID).pieces.find(
        (p) => p.platform === "linkedin",
      );
      expect(approved?.front.state).toBe("approved");
      expect(approved?.front.exportPath).toMatch(/^content\/approved\/linkedin\//);
    } finally {
      r.s.cleanup();
    }
  });
});
