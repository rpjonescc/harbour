import { join } from "node:path";
import { z } from "zod";
import { PLATFORMS } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import {
  type GateEntry,
  gateEntrySchema,
  type PieceFront,
  parsePieceFile,
} from "@/lib/content/schema";
import type { PieceContent } from "@/lib/content/shapes";
import { readBoundedBytes } from "@/lib/note/bounded-read";

export type ReadPiece = {
  platform: (typeof PLATFORMS)[number];
  front: PieceFront;
  content: PieceContent | null;
  body: string;
  gates: GateEntry[];
};

const sidecarSchema = z.array(gateEntrySchema).max(40);
const MAX_PIECE_BYTES = 128 * 1024;
const MAX_GATES_BYTES = 256 * 1024;

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** The gate sidecar's text for a list of entries (what the worker writes). */
export const renderGates = (entries: readonly GateEntry[]): string =>
  `${JSON.stringify(entries, null, 2)}\n`;

function decode(bytes: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** A sidecar's entries; none when it is missing, and null when it is not valid. */
function readGates(
  root: string,
  ideaId: string,
  platform: (typeof PLATFORMS)[number],
): GateEntry[] | null {
  try {
    const bytes = readBoundedBytes(
      join(root, contentPaths.gates(ideaId, platform)),
      MAX_GATES_BYTES,
    );
    const text = bytes === null ? null : decode(bytes);
    if (text === null) return null;
    const parsed = sidecarSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (missing(error)) return [];
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/**
 * An idea's platform pieces in platform order. A file that is not a valid piece is named in
 * `unreadable` (never hidden, never a crash); a sidecar that is not valid is named too and the
 * piece shows no gate results.
 */
export function readPieces(
  root: string,
  ideaId: string,
): { pieces: ReadPiece[]; unreadable: string[] } {
  const pieces: ReadPiece[] = [];
  const unreadable: string[] = [];
  for (const platform of PLATFORMS) {
    const path = contentPaths.piece(ideaId, platform);
    let bytes: Buffer | null;
    try {
      bytes = readBoundedBytes(join(root, path), MAX_PIECE_BYTES);
    } catch (error) {
      if (missing(error)) continue;
      throw error;
    }
    const text = bytes === null ? null : decode(bytes);
    const parsed = text === null ? null : parsePieceFile(text);
    // A piece of another platform's name or idea is not this idea's piece.
    if (
      !parsed?.ok ||
      parsed.value.front.platform !== platform ||
      parsed.value.front.ideaId !== ideaId
    ) {
      unreadable.push(path);
      continue;
    }
    const gates = readGates(root, ideaId, platform);
    if (gates === null) unreadable.push(contentPaths.gates(ideaId, platform));
    pieces.push({
      platform,
      front: parsed.value.front,
      content: parsed.value.content,
      body: parsed.body,
      gates: gates ?? [],
    });
  }
  return { pieces, unreadable };
}
