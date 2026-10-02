import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The voice-profile template shown when a product has no profile; null when the checkout lacks it. */
export function readVoiceTemplate(): string | null {
  try {
    return readFileSync(join(process.cwd(), "skills", "atomizer", "voice-profile.md"), "utf8");
  } catch {
    return null; // the page then points at the file's path instead of showing it
  }
}
