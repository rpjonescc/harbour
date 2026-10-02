import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PLATFORMS } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { readPieces } from "@/lib/content/read/pieces";
import { eventsSince } from "@/lib/jobs/queue";
import { seedAfterAB } from "@/tests/helpers/chain";
import { contentSetup, dumpDb, VOICE_ACME } from "@/tests/helpers/content";
import { runOne } from "@/tests/helpers/run-job";

const IDEA = "acme-docs-20261001-five-minutes";
const FILES = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "# Acme Docs\n\nA first deploy takes about five minutes.\n",
  ...seedAfterAB(IDEA),
};
const claims = (text: string) => ({
  pieces: PLATFORMS.map((platform) => ({
    platform,
    claims: [{ text, trace: "source:p1" }],
    questions: [],
  })),
});
const go = (s: ReturnType<typeof contentSetup>) =>
  runOne(s.deps, "content-gate", { ideaId: IDEA, gate: "facts", attempt: "1" });

describe("the facts gate under hostile output", () => {
  it("keeps agent-chosen text out of the run record, even when the run is refused", async () => {
    const canary = "CANARY-FACTS-7731";
    const s = contentSetup({ "gate:facts:1": claims("Quick.") }, FILES, {
      echo: { text: canary, hostile: true },
    });
    try {
      const job = await go(s);
      expect(job.status).toBe("failed");
      const record = JSON.stringify(eventsSince(s.deps.db, job.id, 0)) + dumpDb(s.deps.db);
      expect(record).not.toContain(canary);
      expect(readPieces(s.brain.root, IDEA).pieces.every((p) => p.front.state === "drafting")).toBe(
        true,
      );
    } finally {
      s.cleanup();
    }
  });

  it("shows a claim that is not plain text as a fixed placeholder, never as written", async () => {
    const s = contentSetup({ "gate:facts:1": claims("<script>alert(1)</script> CANARY") }, FILES);
    try {
      const job = await go(s);
      expect(job.status).toBe("ok");
      const stored = JSON.stringify(
        readPieces(s.brain.root, IDEA).pieces.map((p) => [p.front.claims, p.gates]),
      );
      expect(stored).not.toMatch(/script|CANARY/);
      const events = eventsSince(s.deps.db, job.id, 0)
        .map((e) => e.text)
        .join("\n");
      expect(events).not.toMatch(/script|CANARY/);
    } finally {
      s.cleanup();
    }
  });

  it("saves nothing when the owner changed a piece while the agent worked", async () => {
    const s = contentSetup({ "gate:facts:1": claims("Quick.") }, FILES);
    const path = join(s.brain.root, contentPaths.piece(IDEA, "x"));
    const original = s.deps.run;
    s.deps.run = async (o) => {
      const out = await original(o);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, readFileSync(path, "utf8").replace("revision: 1", "revision: 2"));
      return out;
    };
    try {
      const job = await go(s);
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/changed while it was being checked/);
      const linkedin = readPieces(s.brain.root, IDEA).pieces.find((p) => p.platform === "linkedin");
      expect(linkedin?.gates).toHaveLength(2);
    } finally {
      s.cleanup();
    }
  });

  it("refuses to run with no source piece, in plain words", async () => {
    const files = Object.fromEntries(
      Object.entries(FILES).filter(([path]) => !path.endsWith("/source.md")),
    );
    const s = contentSetup({ "gate:facts:1": claims("Quick.") }, files);
    try {
      const job = await go(s);
      expect(job).toMatchObject({
        status: "failed",
        error: "There is no source piece to check the pieces against.",
      });
    } finally {
      s.cleanup();
    }
  });
});
