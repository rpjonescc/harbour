import type { ContentProduct } from "@/lib/products/content";
import { type ReadIdea, readIdeas } from "./ideas";
import { type ReadPiece, readPieces } from "./pieces";

export const MAX_IDEAS = 200;
export const MAX_PIECES = 600;
/** Extra files read per product so a few broken ones can't hide that more than 200 ideas exist. */
const BROKEN_FILE_SLACK = 10;

export type IdeaEntry = { idea: ReadIdea; product: ContentProduct };
export type ContentScan = {
  /** Newest first, at most 200. */
  entries: IdeaEntry[];
  /** Pieces by idea id, at most 600 in all. */
  pieces: Map<string, ReadPiece[]>;
  /** Which cap cut the list short, if one did. */
  capped: "ideas" | "pieces" | null;
  unreadable: string[];
  /** A folder could not be read at all (permissions, a disk fault): said plainly, never a crash. */
  folderError: boolean;
};

/** An idea's pieces exist only once it has been picked; a discarded idea shows as one card. */
const hasPieces = (idea: ReadIdea) => !["idea", "discarded"].includes(idea.front.state);

function readEntries(root: string, products: readonly ContentProduct[], scan: ContentScan) {
  const entries = products.flatMap((product) => {
    try {
      const read = readIdeas(root, product.id, MAX_IDEAS + 1 + BROKEN_FILE_SLACK);
      scan.unreadable.push(...read.unreadable);
      return read.ideas.map((idea) => ({ idea, product }));
    } catch {
      scan.folderError = true; // recorded and shown, not an empty "no ideas"
      return [];
    }
  });
  entries.sort(
    (a, b) =>
      b.idea.front.created.localeCompare(a.idea.front.created) ||
      b.idea.id.localeCompare(a.idea.id),
  );
  if (entries.length > MAX_IDEAS) scan.capped = "ideas";
  scan.entries = entries.slice(0, MAX_IDEAS);
}

/**
 * The one reader behind the Content page and the sidebar count, so the two cannot disagree:
 * the newest 200 ideas and 600 pieces. `gates: false` skips the gate sidecars (the count needs
 * only states). Never writes, never throws on an unreadable folder.
 */
export function scanContent(
  root: string,
  products: readonly ContentProduct[],
  options: { gates: boolean },
): ContentScan {
  const scan: ContentScan = {
    entries: [],
    pieces: new Map(),
    capped: null,
    unreadable: [],
    folderError: false,
  };
  readEntries(root, products, scan);
  let budget = MAX_PIECES;
  for (const { idea } of scan.entries) {
    if (!hasPieces(idea)) continue;
    try {
      const read = readPieces(root, idea.id, { gates: options.gates });
      scan.unreadable.push(...read.unreadable);
      if (read.pieces.length > budget) scan.capped ??= "pieces";
      const kept = read.pieces.slice(0, budget);
      budget -= kept.length;
      scan.pieces.set(idea.id, kept);
    } catch {
      scan.folderError = true;
    }
  }
  return scan;
}
