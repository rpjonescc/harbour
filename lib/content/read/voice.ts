import { join } from "node:path";
import { contentPaths } from "@/lib/content/paths";
import { parseVoiceProfile, type VoiceProfile } from "@/lib/content/voice";
import { readBoundedBytes } from "@/lib/note/bounded-read";

export type VoiceState =
  | { state: "ok"; profile: VoiceProfile }
  | { state: "missing" }
  | { state: "invalid"; reason: string };

const MAX_VOICE_BYTES = 64 * 1024;

/** The owner's voice profile for a product, read from the brain; never writes. */
export function readVoice(root: string, productId: string): VoiceState {
  let bytes: Buffer | null;
  try {
    bytes = readBoundedBytes(join(root, contentPaths.voice(productId)), MAX_VOICE_BYTES);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
    throw error;
  }
  if (bytes === null) {
    return { state: "invalid", reason: "The voice profile is too large or is not a plain file." };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { state: "invalid", reason: "The voice profile is not valid UTF-8 text." };
  }
  const parsed = parseVoiceProfile(text, productId);
  return parsed.ok
    ? { state: "ok", profile: parsed.value }
    : { state: "invalid", reason: parsed.reason };
}
