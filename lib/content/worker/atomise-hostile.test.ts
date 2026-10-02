import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS } from "@/lib/content/ids";
import {
  dir,
  FILES,
  go,
  IDEA_ID,
  IDEA_PATH,
  piece,
  read,
  readIdea,
  six,
} from "@/tests/helpers/atomise";
import { contentSetup, ideaFile, PIECES, pieceFile } from "@/tests/helpers/content";
import { runOne } from "@/tests/helpers/run-job";

const nest = (depth: number) => {
  let value: unknown = "x";
  for (let i = 0; i < depth; i += 1) value = { a: value };
  return value;
};

describe("the atomise job and hostile agent output", () => {
  it.each([
    ["an unrequested platform", { pieces: [...six().pieces, piece("tiktok")] }],
    ["a repeated platform", { pieces: [...six().pieces, piece("x")] }],
    ["a smuggled state key", { pieces: six().pieces.map((p) => ({ ...p, state: "approved" })) }],
    ["a smuggled top-level key", { ...six(), approved: true }],
    [
      "more than 20 claims",
      {
        pieces: six().pieces.map((p) =>
          piece(p.platform, {
            claims: Array.from({ length: 21 }, () => ({ text: "A claim.", trace: "source:p1" })),
          }),
        ),
      },
    ],
    [
      "a claim traced to a paragraph that does not exist",
      {
        pieces: six().pieces.map((p) =>
          piece(p.platform, { claims: [{ text: "A claim.", trace: "source:p9" }] }),
        ),
      },
    ],
    [
      "a claim traced to a brain file that is not in the facts",
      {
        pieces: six().pieces.map((p) =>
          piece(p.platform, { claims: [{ text: "A claim.", trace: "brain:products/other.md" }] }),
        ),
      },
    ],
    [
      "a claim with markup",
      {
        pieces: six().pieces.map((p) =>
          piece(p.platform, { claims: [{ text: "<b>claim</b>", trace: "none" }] }),
        ),
      },
    ],
    [
      "a question with a hidden character",
      { pieces: six().pieces.map((p) => piece(p.platform, { questions: ["Is it free?\u200b"] })) },
    ],
    ["a piece with no platform", { pieces: [{ content: PIECES.linkedin }] }],
    ["no pieces", { pieces: [] }],
    [
      "deeply nested content",
      { pieces: six().pieces.map((p) => piece(p.platform, { content: nest(200) })) },
    ],
  ])("rejects %s, retries once, then fails with nothing written", async (_label, works) => {
    const r = go(works);
    try {
      const job = await r.run();
      expect(job.status).toBe("failed");
      expect(r.calls).toHaveLength(2);
      expect(existsSync(join(r.brain.root, `${dir}/linkedin.md`))).toBe(false);
      expect(readIdea(r).state).toBe("drafting");
    } finally {
      r.cleanup();
    }
  });

  it("accepts a claim traced to a fact in the list and to a paragraph that exists", async () => {
    const claims = [
      { text: "Docs publish quickly.", trace: "source:p2" },
      { text: "The free plan has three projects.", trace: "product:acme-docs" },
    ];
    const r = go({ pieces: PLATFORMS.map((p) => piece(p, { claims })) });
    try {
      expect((await r.run()).status).toBe("ok");
      expect(read(r, "linkedin").front.claims).toEqual(claims);
    } finally {
      r.cleanup();
    }
  });

  it("fails a 2 MiB work file as too large, without reading it into a prompt", async () => {
    const s = contentSetup({ atomise: six() }, FILES);
    const run = s.deps.run;
    s.deps.run = async (o) => {
      const out = await run(o);
      const work = readdirSync(join(s.brain.root, "content/work"))[0] ?? "";
      writeFileSync(join(s.brain.root, "content/work", work), "x".repeat(2 * 1024 * 1024));
      return out;
    };
    try {
      const job = await runOne(s.deps, "content-atomise", { ideaId: IDEA_ID });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/too large/);
    } finally {
      s.cleanup();
    }
  });

  it("refuses an idea that is not waiting for its pieces, or that has none of its own source", async () => {
    for (const files of [
      { ...FILES, [IDEA_PATH]: ideaFile({ state: "idea", sources: ["product:acme-docs"] }) },
      Object.fromEntries(Object.entries(FILES).filter(([path]) => !path.endsWith("source.md"))),
    ]) {
      const r = go(six(), files);
      try {
        const job = await r.run();
        expect(job.status).toBe("failed");
        expect(job.error).toMatch(/no source piece waiting/);
        expect(r.calls).toHaveLength(0);
      } finally {
        r.cleanup();
      }
    }
  });

  it("never writes over a piece that is already there, edited by the owner or not", async () => {
    const owner = pieceFile(IDEA_ID, "linkedin").replace("Docs that ship", "Owner's own words");
    const r = go(six(), { ...FILES, [`${dir}/linkedin.md`]: owner });
    try {
      const job = await r.run();
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/already has platform pieces/);
      expect(readFileSync(join(r.brain.root, `${dir}/linkedin.md`), "utf8")).toBe(owner);
      expect(existsSync(join(r.brain.root, `${dir}/x.md`))).toBe(false);
    } finally {
      r.cleanup();
    }
  });

  it("does not overwrite a piece that appears while the agent works, and leaves the idea alone", async () => {
    const s = contentSetup({ atomise: six() }, FILES);
    const run = s.deps.run;
    s.deps.run = async (o) => {
      const out = await run(o);
      writeFileSync(join(s.brain.root, `${dir}/website.md`), "The owner's file.\n");
      return out;
    };
    try {
      const job = await runOne(s.deps, "content-atomise", { ideaId: IDEA_ID });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/appeared while/);
      // The failed run sets the stray file aside, but nothing of ours is written over it.
      expect(existsSync(join(s.brain.root, `${dir}/website.md`))).toBe(false);
      expect(existsSync(join(s.brain.root, `${dir}/linkedin.md`))).toBe(false);
    } finally {
      s.cleanup();
    }
  });

  it("refuses to write over an idea the owner edited while the agent worked", async () => {
    const s = contentSetup({ atomise: six() }, FILES);
    const run = s.deps.run;
    s.deps.run = async (o) => {
      const out = await run(o);
      writeFileSync(
        join(s.brain.root, IDEA_PATH),
        `${readFileSync(join(s.brain.root, IDEA_PATH), "utf8")}\nMy edit.\n`,
      );
      return out;
    };
    try {
      const job = await runOne(s.deps, "content-atomise", { ideaId: IDEA_ID });
      expect(job.status).toBe("failed");
      expect(existsSync(join(s.brain.root, `${dir}/linkedin.md`))).toBe(false);
    } finally {
      s.cleanup();
    }
  });
});
