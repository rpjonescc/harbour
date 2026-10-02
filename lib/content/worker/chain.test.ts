import { PLATFORMS } from "@/lib/content/ids";
import { enqueueContent } from "@/lib/content/limits";
import { readPieces } from "@/lib/content/read/pieces";
import { listJobs } from "@/lib/jobs/queue";
import { CHAIN_WORKS, runChain } from "@/tests/helpers/chain";
import { contentSetup, ideaFile, PIECES, VOICE_ACME } from "@/tests/helpers/content";

const IDEA = "acme-docs-20261001-five-minutes";
const FILES = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "# Acme Docs\n\nA first deploy takes about five minutes.\n",
  [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile({ sources: ["product:acme-docs"] }),
};
const FINDING = { pattern: "Colon reveals", quote: "The best part: fast.", fix: "plain sentence" };
type Skill = "gate:no-ai-slop:1" | "gate:humanizer:1";
const withFinding = (key: Skill) => ({
  pieces: CHAIN_WORKS[key].pieces.map((p) =>
    p.platform === "x" ? { ...p, findings: [FINDING] } : p,
  ),
});
const xOnly = (findings: unknown[]) => ({
  pieces: [{ platform: "x", content: PIECES.x, findings, questions: [] }],
});

async function chain(works: Record<string, unknown>) {
  const s = contentSetup(works, FILES);
  enqueueContent(s.deps.db, {
    kind: "content-draft",
    params: { ideaId: IDEA },
    requestedBy: "me",
    timeZone: "Europe/London",
    now: new Date(),
    dailyRuns: 24,
  });
  await runChain(s);
  const order = listJobs(s.deps.db, 50)
    .reverse()
    .map(
      (j) =>
        `${j.kind.replace("content-", "")}${j.params.gate ? `:${j.params.gate}:${j.params.attempt}` : ""}:${j.status}`,
    );
  return { s, order, pieces: readPieces(s.brain.root, IDEA).pieces };
}

describe("the whole chain", () => {
  it("takes an idea from Write this to six Ready pieces in five agent runs, each through the real runner", async () => {
    const { s, order, pieces } = await chain(CHAIN_WORKS);
    try {
      expect(order).toEqual([
        "draft:ok",
        "atomise:ok",
        "gate:no-ai-slop:1:ok",
        "gate:humanizer:1:ok",
        "gate:facts:1:ok",
      ]);
      expect(pieces.map((p) => p.front.state)).toEqual(Array(6).fill("ready"));
      expect(pieces[0]?.gates.map((g) => g.gate)).toEqual([
        "no-ai-slop",
        "humanizer",
        "facts",
        "platform",
      ]);
      expect(pieces.every((p) => p.front.approvedAt === null)).toBe(true);
    } finally {
      s.cleanup();
    }
  });

  it("runs every later gate even after a failure, and ends Needs you with the failing gate's sentence", async () => {
    const works = {
      ...CHAIN_WORKS,
      "gate:no-ai-slop:1": withFinding("gate:no-ai-slop:1"),
      "gate:no-ai-slop:2": xOnly([FINDING]),
    };
    const { s, order, pieces } = await chain(works);
    try {
      expect(order).toEqual([
        "draft:ok",
        "atomise:ok",
        "gate:no-ai-slop:1:ok",
        "gate:no-ai-slop:2:ok",
        "gate:humanizer:1:ok",
        "gate:facts:1:ok",
      ]);
      const x = pieces.find((p) => p.platform === "x");
      expect(x?.front).toMatchObject({
        state: "needs-you",
        needsYou: "The no-ai-slop check still found 1 pattern. Edit the piece, or discard it.",
      });
      expect(pieces.filter((p) => p.front.state === "ready")).toHaveLength(5);
    } finally {
      s.cleanup();
    }
  });

  it("stays within eight agent runs per idea even when every gate needs its one revision", async () => {
    const claim = { text: "Everyone loves it.", trace: "none" };
    const works = {
      ...CHAIN_WORKS,
      "gate:no-ai-slop:1": withFinding("gate:no-ai-slop:1"),
      "gate:no-ai-slop:2": xOnly([]),
      "gate:humanizer:1": withFinding("gate:humanizer:1"),
      "gate:humanizer:2": xOnly([]),
      "gate:facts:1": {
        pieces: PLATFORMS.map((platform) => ({
          platform,
          claims: platform === "x" ? [claim] : [{ text: "Quick.", trace: "source:p1" }],
          questions: [],
        })),
      },
      "gate:facts:2": {
        pieces: [
          {
            platform: "x",
            content: PIECES.x,
            claims: [{ text: "Quick.", trace: "source:p1" }],
            questions: [],
          },
        ],
      },
    };
    const { s, order, pieces } = await chain(works);
    try {
      expect(order).toHaveLength(8);
      expect(order.at(-1)).toBe("gate:facts:2:ok");
      expect(pieces.find((p) => p.platform === "x")?.front).toMatchObject({
        state: "ready",
        gates: { slop: "revised", humanizer: "revised", facts: "revised", platform: "revised" },
      });
      expect(pieces.filter((p) => p.front.state === "ready")).toHaveLength(6);
    } finally {
      s.cleanup();
    }
  });
});
