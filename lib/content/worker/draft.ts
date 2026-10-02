import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import type { AgentSpec, SpecContext } from "@/lib/agents/specs";
import { parseFile, renderFile } from "@/lib/content/files";
import { ideaIdSchema, productForIdea } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { DRAFT_PROMPT_VERSION, draftPrompt } from "@/lib/content/prompts/draft";
import { readVoice } from "@/lib/content/read/voice";
import { type IdeaFront, ideaFrontmatter } from "@/lib/content/schema";
import { voiceInvalidMessage, voiceMissingMessage } from "@/lib/explain/content";
import { readBoundedBytes } from "@/lib/note/bounded-read";
import {
  type DraftWork,
  draftProblem,
  draftWorkSchema,
  inventedNumbers,
  inventedNumbersNote,
} from "./draft-check";
import { buildFactsPack, FactsPackError, factsPackText } from "./facts-pack";
import { requireContent } from "./run-context";
import { loadSkill, SkillError, skillRecord } from "./skills";
import { parseWorkJson, workReview } from "./work-review";

const MAX_IDEA_BYTES = 32 * 1024;
const SOURCE_IN_THE_WAY =
  "A source piece for this idea appeared while it was being written, so Harbour saved nothing.";

/** A reason the draft cannot start, in words written here (never file or agent text). */
export class DraftStartError extends Error {}

export type IdeaRead = { idea: IdeaFront; body: string; sha256: string };

/** The idea file, or a plain reason why not; an unreadable, oversized or odd file is never guessed at. */
export function readIdeaFile(root: string, path: string): IdeaRead {
  const gone = new DraftStartError("The idea file could not be read.");
  let bytes: Buffer | null;
  try {
    bytes = readBoundedBytes(join(root, path), MAX_IDEA_BYTES);
  } catch {
    throw gone;
  }
  if (bytes === null) throw gone;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw gone;
  }
  const parsed = parseFile(text, ideaFrontmatter);
  if (!parsed.ok) throw gone;
  return {
    idea: parsed.value,
    body: parsed.body,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export const exists = (root: string, path: string): boolean => {
  try {
    lstatSync(join(root, path)); // lstat: a dangling link still owns the name
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

/** The words the owner sees for this job: the idea's slug, which the worker made from a validated title. */
export const labelOf = (ideaId: string) =>
  ideaId.replace(/^[a-z0-9-]+?-\d{8}-/, "").replaceAll("-", " ");

function prepare(params: Record<string, string>, context: SpecContext) {
  const content = requireContent(context);
  const id = ideaIdSchema.safeParse(params.ideaId);
  if (!id.success) throw new DraftStartError("This is not an idea Harbour knows.");
  const ideaId = id.data;
  const product = productForIdea(content.products, ideaId);
  if (!product)
    throw new DraftStartError("This idea belongs to a product that has no content settings.");
  const ideaPath = contentPaths.idea(product.id, ideaId);
  const read = readIdeaFile(content.root, ideaPath);
  if (read.idea.productId !== product.id)
    throw new DraftStartError("The idea file could not be read.");
  if (read.idea.state !== "idea")
    throw new DraftStartError("This idea has already been written or was discarded.");
  const sourcePath = contentPaths.source(ideaId);
  if (exists(content.root, sourcePath))
    throw new DraftStartError("This idea already has a source piece.");
  const voice = readVoice(content.root, product.id);
  if (voice.state === "missing") throw new DraftStartError(voiceMissingMessage(product.name));
  if (voice.state === "invalid")
    throw new DraftStartError(voiceInvalidMessage(product.name, voice.reason));
  return { content, ideaId, product, ideaPath, sourcePath, read, voice: voice.profile };
}

/** The draft agent: one source piece of 400 to 900 words from an idea, the voice and the facts pack. */
export function draftSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  try {
    return buildSpec(params, context);
  } catch (error) {
    if (
      error instanceof DraftStartError ||
      error instanceof SkillError ||
      error instanceof FactsPackError
    ) {
      throw error;
    }
    // Anything else (a disk error, a bad id) says nothing about files, ids or text.
    throw new Error(
      "Harbour couldn't read what it needs to write this idea. Check the brain folder, then try again.",
    );
  }
}

function buildSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const { content, ideaId, product, ideaPath, sourcePath, read, voice } = prepare(params, context);
  const skill = loadSkill(content.skillsDir, "atomizer"); // throws SkillError with a plain reason
  const pack = buildFactsPack({
    root: content.root,
    product,
    idea: read.idea,
    pillars: content.approvedPillars(product.id),
  });
  const prompt = draftPrompt({
    jobId: context.jobId,
    skill,
    voice,
    productName: product.name,
    productUrl: product.url,
    idea: read.idea,
    facts: factsPackText(pack),
  });
  // Empty on purpose: the worker adds the exact files it writes (decision 18), so the agent can
  // never write the idea or the source itself, and a failed run never touches the owner's idea.
  const allowed = { prefixes: [], exact: [] as string[] };
  const files = (work: DraftWork, note: (text: string) => void): Record<string, string> => {
    // The owner may have edited the idea since this run started: never write over that.
    if (readIdeaFile(content.root, ideaPath).sha256 !== read.sha256) {
      throw new DraftStartError(
        "The idea changed while it was being written, so Harbour saved nothing.",
      );
    }
    note(
      `Skill ${skill.name}: ${skill.files.map((f) => `${f.name} ${f.sha256.slice(0, 12)}`).join(", ")}`,
    );
    const invented = inventedNumbers(work, pack);
    if (invented.length > 0) {
      note(
        `The draft used ${invented.length} number(s) that are in no source; no source piece was written`,
      );
      const needsYou = inventedNumbersNote(context.jobId, invented);
      return { [ideaPath]: renderFile({ ...read.idea, needsYou }, read.body) };
    }
    const source = {
      title: work.title,
      kind: "content-source",
      ideaId,
      productId: product.id,
      paragraphs: work.paragraphs.map((p) => p.id),
      facts: [...new Set(work.paragraphs.flatMap((p) => p.facts))],
      questions: work.questions,
      createdBy: `job-${context.jobId}`,
      skills: [skillRecord(skill)],
    };
    return {
      [sourcePath]: renderFile(source, work.paragraphs.map((p) => p.text).join("\n\n")),
      [ideaPath]: renderFile({ ...read.idea, state: "drafting", needsYou: null }, read.body),
    };
  };
  return {
    kind: "content-draft",
    label: `Writing: ${labelOf(ideaId)}`,
    prompt,
    allowed,
    targets: [contentPaths.work(context.jobId)],
    output: null,
    requiredFiles: [],
    requiredOutputs: [ideaPath],
    promptVersion: DRAFT_PROMPT_VERSION,
    tools: ["Write"],
    stdin: true,
    // The agent's own words can quote the notes it was given: they stay out of the run record.
    quiet: true,
    quietFailure: "The draft agent didn't finish.",
    review: workReview({
      jobId: context.jobId,
      prompt,
      allowed,
      plan: {
        // The source is a new file; only the idea file is replaced.
        createOnly: { inTheWay: SOURCE_IN_THE_WAY, except: [ideaPath] },
        parse: (raw) => {
          const parsed = parseWorkJson(raw, draftWorkSchema);
          if (!parsed.ok) return parsed;
          const reason = draftProblem(parsed.value, pack, product.allowedHosts);
          return reason ? { ok: false, reason } : parsed;
        },
        files,
      },
    }),
  };
}
