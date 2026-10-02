import type { ChainPiece, GateStep } from "@/lib/content/chain";
import { gateTargets } from "@/lib/content/chain";
import { productForIdea } from "@/lib/content/ids";
import type { ReadPiece } from "@/lib/content/read/pieces";
import { readSource, type SourceRead } from "@/lib/content/read/source";
import { readVoice } from "@/lib/content/read/voice";
import type { VoiceProfile } from "@/lib/content/voice";
import { voiceInvalidMessage, voiceMissingMessage } from "@/lib/explain/content";
import type { ContentProduct } from "@/lib/products/content";
import { chainView } from "./chain-pieces";
import { DraftStartError } from "./draft";
import { ownHosts } from "./draft-check";
import type { ContentRunContext } from "./run-context";

/** What every gate run needs before it asks an agent anything; plain `DraftStartError`s when it is missing. */
export function gateInputs(
  content: ContentRunContext,
  ideaId: string,
  step: GateStep,
): {
  product: ContentProduct;
  voice: VoiceProfile;
  view: { pieces: ReadPiece[]; chain: ChainPiece[] };
  targets: ReadPiece[];
  hosts: string[];
  source: SourceRead | null;
} {
  const product = productForIdea(content.products, ideaId);
  if (!product) {
    throw new DraftStartError("This idea belongs to a product that has no content settings.");
  }
  const voice = readVoice(content.root, product.id);
  if (voice.state === "missing") throw new DraftStartError(voiceMissingMessage(product.name));
  if (voice.state === "invalid") {
    throw new DraftStartError(voiceInvalidMessage(product.name, voice.reason));
  }
  const view = chainView(content.root, ideaId);
  const wanted = new Set(gateTargets(view.chain, step).map((t) => t.platform));
  const targets = view.pieces.filter((p) => wanted.has(p.platform));
  if (targets.length === 0)
    throw new DraftStartError("There is nothing for this check to look at.");
  return {
    product,
    voice: voice.profile,
    view,
    targets,
    hosts: ownHosts(product.url),
    source: readSource(content.root, ideaId),
  };
}
