import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS, type Platform } from "@/lib/content/ids";
import { enqueueContent } from "@/lib/content/limits";
import { readPieces } from "@/lib/content/read/pieces";
import { listJobs } from "@/lib/jobs/queue";
import { runChain } from "./chain";
import { CHAIN_WORKS, contentSetup, ideaFile, PIECES, VOICE_ACME } from "./content";

// Shared by the adversarial suites (lib/content/adversarial*.test.ts): the whole chain through
// the real runner, with the fake CLI replaying whatever hostile fixtures a row hands it.

export const IDEA_ID = "acme-docs-20261001-five-minutes";
export const FILES = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "# Acme Docs\n\nA first deploy takes about five minutes.\n",
  [`content/ideas/acme-docs/${IDEA_ID}.md`]: ideaFile({ sources: ["product:acme-docs"] }),
};
export type Setup = ReturnType<typeof contentSetup>;
export const CLAIM = { text: "Quick.", trace: "source:p1" };

/** "Write this" through the whole chain, and everything an assertion could want to look at. */
export async function chain(
  works: Record<string, unknown>,
  before?: (s: Setup) => void,
  options?: Parameters<typeof contentSetup>[2],
) {
  const s = contentSetup(works, FILES, options);
  before?.(s);
  enqueueContent(s.deps.db, {
    kind: "content-draft",
    params: { ideaId: IDEA_ID },
    requestedBy: "me",
    timeZone: "Europe/London",
    now: new Date(),
    dailyRuns: 24,
  });
  await runChain(s);
  const jobs = listJobs(s.deps.db, 50)
    .reverse()
    .map(
      (j) =>
        `${j.kind.replace("content-", "")}${j.params.gate ? `:${j.params.gate}:${j.params.attempt}` : ""}:${j.status}`,
    );
  const pieces = readPieces(s.brain.root, IDEA_ID).pieces;
  const piece = (platform: Platform) => {
    const found = pieces.find((p) => p.platform === platform);
    if (!found) throw new Error(`no ${platform} piece`);
    return found;
  };
  return { s, jobs, pieces, piece };
}
export type Run = Awaited<ReturnType<typeof chain>>;

/** Nothing a hostile agent did can have approved a piece: only the owner's decision does that. */
export function expectNothingApproved({ s, pieces }: Run) {
  for (const p of pieces) {
    expect(p.front.state).not.toBe("approved");
    expect(p.front.approvedAt).toBeNull();
    expect(p.front.exportPath).toBeNull();
  }
  // A discarded stray can leave an empty folder behind; what matters is that no export file exists.
  const dir = join(s.brain.root, "content/approved");
  const exports = existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    : [];
  expect(exports).toEqual([]);
}

/**
 * The fixtures for a chain whose atomise answer holds `contents` instead of the clean pieces: the
 * writing checks hand each (gated) piece back as it is, and the facts check lists a traced claim.
 */
export function worksWith(
  contents: Partial<Record<Platform, unknown>>,
  gated: readonly Platform[] = PLATFORMS,
) {
  const all = PLATFORMS.map((platform) => ({
    platform,
    content: contents[platform] ?? PIECES[platform],
  }));
  const back = {
    pieces: all
      .filter((p) => gated.includes(p.platform))
      .map((p) => ({ ...p, findings: [], questions: [] })),
  };
  return {
    ...CHAIN_WORKS,
    atomise: { pieces: all.map((p) => ({ ...p, claims: [CLAIM], questions: [] })) },
    "gate:no-ai-slop:1": back,
    "gate:humanizer:1": back,
    "gate:facts:1": {
      pieces: gated.map((platform) => ({ platform, claims: [CLAIM], questions: [] })),
    },
  };
}
