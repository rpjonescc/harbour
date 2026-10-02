import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFile, renderFile } from "@/lib/content/files";
import { PLATFORMS } from "@/lib/content/ids";
import { ideaFrontmatter, parsePieceFile } from "@/lib/content/schema";
import { eventsSince } from "@/lib/jobs/queue";
import { contentSetup, ideaFile, PIECES, VOICE_ACME } from "./content";
import { runOne } from "./run-job";

/** The fixture an atomise run starts from: an idea being written, with a two-paragraph source piece. */
export const IDEA_ID = "acme-docs-20261001-five-minutes";
export const IDEA_PATH = `content/ideas/acme-docs/${IDEA_ID}.md`;
export const dir = `content/pieces/${IDEA_ID}`;
export const FILES = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "# Acme Docs\n\nThe free plan has three projects.\n",
  [IDEA_PATH]: ideaFile({ state: "drafting", sources: ["product:acme-docs"] }),
  [`${dir}/source.md`]: renderFile(
    {
      title: "Five minutes to a first deploy",
      kind: "content-source",
      ideaId: IDEA_ID,
      productId: "acme-docs",
      paragraphs: ["p1", "p2"],
      facts: ["product:acme-docs"],
      questions: [],
      createdBy: "job-1",
      skills: [],
    },
    "Publish docs in a short first deploy.\n\nConnect a repository and press publish.",
  ),
};
export const piece = (platform: string, over: Record<string, unknown> = {}) => ({
  platform,
  content: PIECES[platform as keyof typeof PIECES],
  claims: [{ text: "Docs publish quickly.", trace: "source:p1" }],
  questions: [],
  ...over,
});
export const six = () => ({ pieces: PLATFORMS.map((p) => piece(p)) });
export const go = (works: unknown, files: Record<string, string> = FILES) => {
  const s = contentSetup({ atomise: works }, files);
  return { ...s, run: () => runOne(s.deps, "content-atomise", { ideaId: IDEA_ID }) };
};
export type R = ReturnType<typeof go>;
export const read = (r: R, platform: string) => {
  const parsed = parsePieceFile(readFileSync(join(r.brain.root, `${dir}/${platform}.md`), "utf8"));
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
};
export const readIdea = (r: R) => {
  const idea = parseFile(readFileSync(join(r.brain.root, IDEA_PATH), "utf8"), ideaFrontmatter);
  if (!idea.ok) throw new Error("the idea file must stay valid");
  return idea.value;
};
export const events = (r: R, id: number) =>
  eventsSince(r.deps.db, id, 0)
    .map((e) => e.text)
    .join("\n");
