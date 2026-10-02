import type { PieceContent } from "./shapes";

/** Every text in a piece, in reading order, with no numbering or labels (what the checks run over). */
export function allText(content: PieceContent): string {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(content);
  return out.join("\n");
}
