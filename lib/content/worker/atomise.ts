import type { AgentSpec, SpecContext } from "@/lib/agents/specs";
import { renderFile } from "@/lib/content/files";
import { ideaIdSchema, PLATFORM_NAMES, type Platform, productForIdea } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { ATOMISE_PROMPT_VERSION, atomisePrompt } from "@/lib/content/prompts/atomise";
import { readPieces, renderGates } from "@/lib/content/read/pieces";
import { readSource } from "@/lib/content/read/source";
import { readVoice } from "@/lib/content/read/voice";
import { renderPiece } from "@/lib/content/render";
import type { PieceFront } from "@/lib/content/schema";
import { voiceInvalidMessage, voiceMissingMessage } from "@/lib/explain/content";
import { type AtomiseWork, atomiseProblem, atomiseWorkSchema, makeOne } from "./atomise-check";
import { DraftStartError, exists, labelOf, readIdeaFile } from "./draft";
import { buildFactsPack, FactsPackError, factsPackText } from "./facts-pack";
import { requireContent } from "./run-context";
import { loadSkill, SkillError } from "./skills";
import { parseWorkJson, workReview } from "./work-review";

const MAX_TITLE = 120;

/** A new piece's frontmatter: always the worker's, always `drafting` or a Needs you stub. */
export function newPieceFront(input: {
  title: string;
  ideaId: string;
  productId: string;
  platform: Platform;
  claims: PieceFront["claims"];
  questions: string[];
  stub: string | null;
  content: unknown;
}): PieceFront {
  return {
    title: input.title,
    kind: "content-piece",
    ideaId: input.ideaId,
    productId: input.productId,
    platform: input.platform,
    state: input.stub ? "needs-you" : "drafting",
    revision: 1,
    gates: { slop: "pending", humanizer: "pending", facts: "pending", platform: "pending" },
    flags: [...new Set(input.claims.flatMap((c) => (c.flag ? [c.flag] : [])))],
    claims: input.claims,
    questions: input.questions,
    needsYou: input.stub,
    edited: false,
    approvedAt: null,
    exportPath: null,
    content: input.content,
  };
}

/** The piece's title: the source's, cut so the platform name fits the frontmatter's cap. */
function pieceTitle(sourceTitle: string, platform: Platform): string {
  const suffix = ` (${PLATFORM_NAMES[platform]})`;
  return `${sourceTitle.slice(0, MAX_TITLE - suffix.length).trimEnd()}${suffix}`;
}

/** Plain failures the owner can act on, as with the draft step; anything else says nothing about files. */
export function atomiseSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
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
    throw new Error(
      "Harbour couldn't read what it needs to write the platform pieces. Check the brain folder, then try again.",
    );
  }
}

function prepare(params: Record<string, string>, context: SpecContext) {
  const content = requireContent(context);
  const id = ideaIdSchema.safeParse(params.ideaId);
  if (!id.success) throw new DraftStartError("This is not an idea Harbour knows.");
  const ideaId = id.data;
  const product = productForIdea(content.products, ideaId);
  if (!product) {
    throw new DraftStartError("This idea belongs to a product that has no content settings.");
  }
  const ideaPath = contentPaths.idea(product.id, ideaId);
  const read = readIdeaFile(content.root, ideaPath);
  const source = readSource(content.root, ideaId);
  if (read.idea.productId !== product.id || read.idea.state !== "drafting" || !source) {
    throw new DraftStartError(
      "There is no source piece waiting to be turned into platform pieces.",
    );
  }
  // A piece, even a broken one, is the owner's to keep: nothing is ever written over it.
  const taken = product.platforms.some(
    (p) =>
      exists(content.root, contentPaths.piece(ideaId, p)) ||
      exists(content.root, contentPaths.gates(ideaId, p)),
  );
  if (taken || readPieces(content.root, ideaId).pieces.length > 0) {
    throw new DraftStartError("This idea already has platform pieces.");
  }
  const voice = readVoice(content.root, product.id);
  if (voice.state === "missing") throw new DraftStartError(voiceMissingMessage(product.name));
  if (voice.state === "invalid") {
    throw new DraftStartError(voiceInvalidMessage(product.name, voice.reason));
  }
  return { content, ideaId, product, ideaPath, read, source, voice: voice.profile };
}

function buildSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const { content, ideaId, product, ideaPath, read, source, voice } = prepare(params, context);
  const skill = loadSkill(content.skillsDir, "atomizer");
  const pack = buildFactsPack({
    root: content.root,
    product,
    idea: read.idea,
    pillars: content.approvedPillars(product.id),
  });
  const prompt = atomisePrompt({
    jobId: context.jobId,
    skill,
    voice,
    platforms: product.platforms,
    productName: product.name,
    productUrl: product.url,
    source: source.paragraphs,
    questions: source.front.questions,
    facts: factsPackText(pack),
  });
  const pieceFiles = product.platforms.flatMap((p) => [
    contentPaths.piece(ideaId, p),
    contentPaths.gates(ideaId, p),
  ]);
  const allowed = { prefixes: [], exact: [ideaPath, ...pieceFiles] };
  const host = new URL(product.url).hostname.toLowerCase().replace(/^www\./, "");
  const files = (work: AtomiseWork, note: (text: string) => void): Record<string, string> => {
    // The owner may have edited the idea since this run started: never write over that.
    if (readIdeaFile(content.root, ideaPath).sha256 !== read.sha256) {
      throw new DraftStartError(
        "The idea changed while it was being written, so Harbour saved nothing.",
      );
    }
    note(
      `Skill ${skill.name}: ${skill.files.map((f) => `${f.name} ${f.sha256.slice(0, 12)}`).join(", ")}`,
    );
    const out: Record<string, string> = {};
    let stubs = 0;
    let hidden = 0;
    for (const platform of product.platforms) {
      const piece = work.pieces.find((p) => p.platform === platform);
      const made = makeOne(piece, platform, [host]);
      if (made.stub) stubs += 1;
      if (made.stripped) hidden += 1;
      const front = newPieceFront({
        title: pieceTitle(source.front.title, platform),
        ideaId,
        productId: product.id,
        platform,
        claims: made.content && piece ? piece.claims : [],
        questions: made.content && piece ? piece.questions : [],
        stub: made.stub,
        content: made.content,
      });
      const body = made.content ? renderPiece(platform, made.content) : "";
      out[contentPaths.piece(ideaId, platform)] = renderFile(front, body);
      out[contentPaths.gates(ideaId, platform)] = renderGates([]);
    }
    if (hidden > 0) note(`Removed hidden characters from ${hidden} piece(s)`);
    if (stubs > 0) note(`${stubs} piece(s) were not written and need the owner`);
    // Last, so a piece that is in the way stops the run before the idea moves on.
    out[ideaPath] = renderFile({ ...read.idea, state: "drafted", needsYou: null }, read.body);
    return out;
  };
  return {
    kind: "content-atomise",
    label: `Atomising: ${labelOf(ideaId)}`,
    prompt,
    allowed,
    targets: [contentPaths.work(context.jobId)],
    output: null,
    requiredFiles: [],
    requiredOutputs: [ideaPath],
    promptVersion: ATOMISE_PROMPT_VERSION,
    tools: ["Write"],
    stdin: true,
    // The agent's own words can quote the notes it was given: they stay out of the run record.
    quiet: true,
    quietFailure: "The platform pieces agent didn't finish.",
    review: workReview({
      jobId: context.jobId,
      prompt,
      allowed,
      plan: {
        parse: (raw) => {
          const parsed = parseWorkJson(raw, atomiseWorkSchema);
          if (!parsed.ok) return parsed;
          const reason = atomiseProblem(parsed.value, product.platforms, {
            pack,
            paragraphs: source.paragraphs.map((p) => p.id),
          });
          return reason ? { ok: false, reason } : parsed;
        },
        files,
        createOnly: {
          inTheWay:
            "A platform piece appeared while these were being written, so Harbour saved nothing.",
          except: [ideaPath],
        },
      },
    }),
  };
}
