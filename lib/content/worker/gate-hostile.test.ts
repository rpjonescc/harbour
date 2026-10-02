import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PLATFORMS } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { readPieces } from "@/lib/content/read/pieces";
import { eventsSince } from "@/lib/jobs/queue";
import { seedPieces } from "@/tests/helpers/chain";
import { contentSetup, PIECES, VOICE_ACME } from "@/tests/helpers/content";
import { runOne } from "@/tests/helpers/run-job";

const IDEA_ID = "acme-docs-20261001-five-minutes";
const FILES = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "# Acme Docs\n",
  ...seedPieces(IDEA_ID),
};
const returned = (over: Record<string, unknown> = {}) => ({
  pieces: PLATFORMS.map((platform) => ({
    platform,
    content: PIECES[platform],
    findings: [],
    questions: [],
    ...over,
  })),
});
const withLinkedin = (content: unknown) => ({
  pieces: returned().pieces.map((p) => (p.platform === "linkedin" ? { ...p, content } : p)),
});
const run = (
  works: unknown,
  gate = "humanizer",
  files = FILES,
  strays?: Record<string, string>,
) => {
  const s = contentSetup({ [`gate:${gate}:1`]: works }, files, { strays });
  return {
    ...s,
    run: () => runOne(s.deps, "content-gate", { ideaId: IDEA_ID, gate, attempt: "1" }),
  };
};
const linkedin = (r: { brain: { root: string } }) => {
  const found = readPieces(r.brain.root, IDEA_ID).pieces.find((p) => p.platform === "linkedin");
  if (!found) throw new Error("no linkedin piece");
  return found;
};

describe("a gate's rewrite is checked like the original", () => {
  it.each([
    ["a number", "Docs that ship in five minutes. Over 300 teams agree."],
    [
      "a link to the product's own site",
      "Docs that ship in five minutes. https://docs.example.com/new",
    ],
    ["a link to another site", "Docs that ship in five minutes. https://evil.example/x"],
    ["a hashtag", "Docs that ship in five minutes. #winning"],
    ["an @handle", "Docs that ship in five minutes. Thanks @someone"],
  ])("rejects %s that was not in the piece, and keeps the old text", async (_label, text) => {
    const r = run(withLinkedin({ text, hashtags: ["#docs"] }));
    try {
      const job = await r.run();
      expect(job.status).toBe("ok");
      const piece = linkedin(r);
      expect(piece.gates[0]).toMatchObject({ gate: "humanizer", result: "error" });
      expect(piece.content).toEqual(PIECES.linkedin);
      expect(piece.front.gates.humanizer).toBe("error");
    } finally {
      r.cleanup();
    }
  });

  it("accepts a rewrite that only reuses what the piece had", async () => {
    const r = run(
      withLinkedin({ text: "Five minutes, then your docs are live.", hashtags: ["#docs"] }),
    );
    try {
      await r.run();
      expect(linkedin(r).gates[0]).toMatchObject({ result: "pass" });
      expect(linkedin(r).content).toMatchObject({ text: "Five minutes, then your docs are live." });
    } finally {
      r.cleanup();
    }
  });
});

describe("hostile output", () => {
  it("shows plain findings only, and never puts agent words in the job's activity", async () => {
    const works = returned({
      findings: [
        { pattern: "<b>Bold</b>", quote: "<script>alert(1)</script>", fix: "CANARY-FIX-TEXT" },
      ],
      questions: ["CANARY-QUESTION <img src=x>"],
    });
    const r = run(works, "no-ai-slop");
    try {
      const job = await r.run();
      const entry = linkedin(r).gates[0];
      expect(entry?.findings[0]).toEqual({
        pattern: "(not shown)",
        quote: "(not shown)",
        fix: "CANARY-FIX-TEXT",
      });
      expect(entry?.questions).toEqual(["The check asked something that could not be shown."]);
      const events = eventsSince(r.deps.db, job.id, 0)
        .map((e) => e.text)
        .join("\n");
      expect(events).not.toMatch(/CANARY|script/);
    } finally {
      r.cleanup();
    }
  });

  it("keeps no link or @handle of anyone's in a finding", async () => {
    const works = returned({
      findings: [{ pattern: "Plain", quote: "see https://evil.example/x", fix: "ask @someone" }],
    });
    const r = run(works, "no-ai-slop");
    try {
      await r.run();
      expect(linkedin(r).gates[0]?.findings[0]).toEqual({
        pattern: "Plain",
        quote: "(not shown)",
        fix: "(not shown)",
      });
    } finally {
      r.cleanup();
    }
  });

  it("refuses an agent that writes a piece or sidecar itself", async () => {
    const stray = contentPaths.piece(IDEA_ID, "linkedin");
    const r = run(returned(), "humanizer", FILES, { [stray]: "not a piece" });
    try {
      const job = await r.run();
      expect(job.status).toBe("failed");
      expect(readFileSync(join(r.brain.root, stray), "utf8")).not.toBe("not a piece");
      expect(linkedin(r).gates).toEqual([]);
    } finally {
      r.cleanup();
    }
  });

  it("saves nothing when the owner changed a piece while the agent worked", async () => {
    const s = contentSetup({ "gate:humanizer:1": returned() }, FILES);
    const path = join(s.brain.root, contentPaths.piece(IDEA_ID, "x"));
    const original = s.deps.run;
    s.deps.run = async (o) => {
      const out = await original(o);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, readFileSync(path, "utf8").replace("revision: 1", "revision: 2"));
      return out;
    };
    try {
      const job = await runOne(s.deps, "content-gate", {
        ideaId: IDEA_ID,
        gate: "humanizer",
        attempt: "1",
      });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/changed while it was being checked/);
      expect(linkedin(s).gates).toEqual([]);
    } finally {
      s.cleanup();
    }
  });

  it.each([
    ["the body text only", "x.md", (t: string) => `${t.trimEnd()} Hand edit.\n`],
    ["the sidecar only", "x.gates.json", () => "[ ]\n"],
  ])(
    "saves nothing when the owner touched %s while the agent worked",
    async (_label, file, edit) => {
      const s = contentSetup({ "gate:humanizer:1": returned() }, FILES);
      const path = join(s.brain.root, "content/pieces", IDEA_ID, file);
      const original = s.deps.run;
      s.deps.run = async (o) => {
        const out = await original(o);
        writeFileSync(path, edit(readFileSync(path, "utf8")));
        return out;
      };
      try {
        const job = await runOne(s.deps, "content-gate", {
          ideaId: IDEA_ID,
          gate: "humanizer",
          attempt: "1",
        });
        expect(job.status).toBe("failed");
        expect(job.error).toMatch(/changed while it was being checked/);
        expect(linkedin(s).gates).toEqual([]);
      } finally {
        s.cleanup();
      }
    },
  );

  it("treats a piece swapped for a huge or non-regular file as changed, without reading it all", async () => {
    const s = contentSetup({ "gate:humanizer:1": returned() }, FILES);
    const path = join(s.brain.root, contentPaths.gates(IDEA_ID, "x"));
    const original = s.deps.run;
    s.deps.run = async (o) => {
      const out = await original(o);
      writeFileSync(path, Buffer.alloc(3 * 1024 * 1024, "a"));
      return out;
    };
    try {
      const job = await runOne(s.deps, "content-gate", {
        ideaId: IDEA_ID,
        gate: "humanizer",
        attempt: "1",
      });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/changed while it was being checked/);
    } finally {
      s.cleanup();
    }
  });

  it.each([
    ["a third facts attempt", { gate: "facts", attempt: "3" }],
    ["an extra facts param", { gate: "facts", attempt: "1", also: "x" }],
    ["an unknown gate", { gate: "everything", attempt: "1" }],
    ["a third attempt", { gate: "humanizer", attempt: "3" }],
    ["an extra param", { gate: "humanizer", attempt: "1", also: "x" }],
  ])("fails plainly for %s", async (_label, extra) => {
    const s = contentSetup({}, FILES);
    try {
      const job = await runOne(s.deps, "content-gate", { ideaId: IDEA_ID, ...extra });
      expect(job).toMatchObject({ status: "failed", error: "This is not a check Harbour knows." });
    } finally {
      s.cleanup();
    }
  });
});
