import { checkClaims } from "@/lib/content/claims-check";
import { editedOutcome, MAX_EDIT_CHARS, NO_CHANGE, tooLongMessage } from "@/lib/content/decision";
import { PLATFORM_NAMES } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { allText } from "@/lib/content/piece-text";
import { checkPlatform } from "@/lib/content/platform-check";
import type { ReadPiece } from "@/lib/content/read/pieces";
import { readSource } from "@/lib/content/read/source";
import { readVoice } from "@/lib/content/read/voice";
import { primaryText, withPrimaryText } from "@/lib/content/render";
import { sanitiseContent } from "@/lib/content/sanitise";
import { contentSchemas, type PieceContent } from "@/lib/content/shapes";
import { transition } from "@/lib/content/state";
import { voiceInvalidMessage, voiceMissingMessage } from "@/lib/explain/content";
import { bumped, fileText, settle } from "./decision-actions";
import {
  type Change,
  type Decision,
  type DecisionContext,
  DecisionRefusal,
} from "./decision-types";
import { ownHosts } from "./draft-check";
import { buildFactsPack, FactsPackError, factsPackText } from "./facts-pack";

const NOT_SAVED = "This piece wasn't saved:";

/** The owner's text in the piece's shape: sanitised, then held to the platform's own limits. */
function shaped(ctx: DecisionContext, piece: ReadPiece, body: string): PieceContent {
  const { platform } = piece.front;
  if (body.length > MAX_EDIT_CHARS[platform]) {
    throw new DecisionRefusal(tooLongMessage(platform));
  }
  const withText = withPrimaryText(platform, piece.content as PieceContent, body);
  const clean = sanitiseContent(platform, withText, ownHosts(ctx.product.url));
  if (!clean.ok) throw new DecisionRefusal(`${NOT_SAVED} ${clean.reason}`);
  // A shape the edit breaks is refused, not stored: a piece that does not fit it cannot be read back.
  const fit = contentSchemas[platform].safeParse(clean.content);
  if (!fit.success) {
    const name = PLATFORM_NAMES[platform];
    throw new DecisionRefusal(
      `${NOT_SAVED} it doesn't fit ${name}'s limits. Check its length, the number of posts and the hashtags.`,
    );
  }
  return fit.data as PieceContent;
}

/** The deterministic checks on the owner's words: numbers and links against the sources, then the platform's rules. */
function checks(ctx: DecisionContext, piece: ReadPiece, content: PieceContent) {
  const voice = readVoice(ctx.root, ctx.product.id);
  if (voice.state === "missing") throw new DecisionRefusal(voiceMissingMessage(ctx.product.name));
  if (voice.state === "invalid") {
    throw new DecisionRefusal(voiceInvalidMessage(ctx.product.name, voice.reason));
  }
  let pack: ReturnType<typeof buildFactsPack>;
  try {
    pack = buildFactsPack({
      root: ctx.root,
      product: ctx.product,
      idea: ctx.idea.front,
      pillars: ctx.pillars,
    });
  } catch (error) {
    if (!(error instanceof FactsPackError)) throw error;
    throw new DecisionRefusal(
      "Harbour couldn't read your notes to check the numbers, so it saved nothing. Check the product's notes, then try again.",
    );
  }
  const source = readSource(ctx.root, piece.front.ideaId);
  const factsText = factsPackText(pack);
  const claims = checkClaims({
    text: allText(content),
    sourceText: (source?.paragraphs ?? []).map((p) => p.text).join("\n"),
    factsText,
    claims: [],
    paragraphIds: source?.front.paragraphs ?? [],
    factRefs: pack.map((f) => f.ref),
    allowedHosts: ownHosts(ctx.product.url),
  });
  const platform = checkPlatform({
    platform: piece.front.platform,
    content,
    voice: voice.profile,
    factsText,
  });
  return { claims, platform };
}

/** Replaces the piece's primary text and re-runs only the deterministic checks (spec §10.3). */
export function edit(ctx: DecisionContext, piece: ReadPiece, d: Decision): Change | null {
  const { platform, ideaId } = piece.front;
  if (piece.content === null) throw new DecisionRefusal("This piece can't be edited now.");
  const content = shaped(ctx, piece, d.body ?? "");
  const same = primaryText(platform, content) === primaryText(platform, piece.content);
  const open = transition(piece.front.state, "edit") !== null;
  // "Already saved" only for a piece that is still editable: a discarded one is stale, not done.
  if (settle(piece, d, piece.front.edited && same && open) === "done") return null;
  // Saving the same words would clear a Needs you without a single change.
  if (same) throw new DecisionRefusal(NO_CHANGE);
  const { claims, platform: platformFindings } = checks(ctx, piece, content);
  const outcome = editedOutcome(
    piece.front.gates,
    claims.findings,
    platformFindings,
    piece.front.questions,
  );
  // A flag already on the piece stays until the owner ticks it at approval; new keyword flags join it.
  const flags = [...new Set([...piece.front.flags, ...claims.flags])];
  const state = transition(piece.front.state, "edit", outcome.state);
  if (state === null) throw new DecisionRefusal("This piece can't be edited now.");
  const front = bumped(piece, {
    content,
    edited: true,
    state,
    needsYou: outcome.needsYou,
    gates: outcome.gates,
    flags,
  });
  return {
    write: { [contentPaths.piece(ideaId, platform)]: fileText(front, content) },
    create: {},
    remove: [],
    message: `content: edit ${ideaId}.${platform}`,
  };
}
