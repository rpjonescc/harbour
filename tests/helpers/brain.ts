import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Temporary brain directory with the given relative files; call cleanup() in afterEach. */
export function makeBrain(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "harbour-brain-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
