import { PLATFORMS, type Platform } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { readPieces } from "@/lib/content/read/pieces";
import { seedAfterAB } from "./chain";
import { contentSetup, PIECES, pieceFile, VOICE_ACME } from "./content";
import { runOne } from "./run-job";

// Shared by the facts gate's tests: a drafted idea whose first two checks passed, and a runner for
// one facts-gate job over it.

export const IDEA = "acme-docs-20261001-five-minutes";
export const NOTES =
  "# Acme Docs\n\nA first deploy takes about five minutes. The free plan has three projects.\n";
export const FILES = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": NOTES,
  ...seedAfterAB(IDEA),
};
export const AB = { slop: "pass", humanizer: "pass", facts: "pending", platform: "pending" };
export const GOOD = { text: "Publishing is quick.", trace: "source:p1" };
export const claimsFor = (over: Partial<Record<Platform, Record<string, unknown>>> = {}) => ({
  pieces: PLATFORMS.map((platform) => ({
    platform,
    claims: [GOOD],
    questions: [],
    ...over[platform],
  })),
});
export const withContent = (platform: Platform, content: unknown) => ({
  [contentPaths.piece(IDEA, platform)]: pieceFile(IDEA, platform, {
    state: "drafting",
    gates: AB,
    content,
  }),
});
export const run = (
  key: string,
  works: unknown,
  files: Record<string, string> = FILES,
  attempt = "1",
) => {
  const s = contentSetup({ [key]: works }, files);
  return {
    ...s,
    run: () => runOne(s.deps, "content-gate", { ideaId: IDEA, gate: "facts", attempt }),
  };
};
export const piece = (r: { brain: { root: string } }, platform: Platform) => {
  const found = readPieces(r.brain.root, IDEA).pieces.find((p) => p.platform === platform);
  if (!found) throw new Error(`no ${platform} piece`);
  return found;
};
export const factsEntry = (p: ReturnType<typeof piece>, attempt = 1) =>
  p.gates.find((g) => g.gate === "facts" && g.attempt === attempt);
export const LINKEDIN_40 = { ...PIECES.linkedin, text: "Cuts build time by 40% for teams." };
