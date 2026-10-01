import type { SourceFile } from "./file-size";

export type HexFinding = { path: string; line: number; match: string };

const UI_PATHS = /^(app|components)\/.*\.(tsx|ts|css)$/;
// 3, 4, 6 or 8 hex digits, not followed by more word characters (so "#main" never matches).
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

/** Finds hardcoded hex colours in UI code; colours must come from design tokens. */
export function findHexColors(file: SourceFile): HexFinding[] {
  if (!UI_PATHS.test(file.path)) return [];
  const findings: HexFinding[] = [];
  file.content.split("\n").forEach((text, index) => {
    for (const match of text.matchAll(HEX)) {
      findings.push({ path: file.path, line: index + 1, match: match[0] });
    }
  });
  return findings;
}
