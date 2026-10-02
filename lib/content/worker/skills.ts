import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The instruction files each skill contributes to a run. */
export const SKILL_FILES = {
  "no-ai-slop": ["SKILL.md", "eval.md"],
  humanizer: ["SKILL.md"],
  atomizer: ["SKILL.md", "platforms.md", "voice-profile.md"],
} as const;
export type SkillName = keyof typeof SKILL_FILES;

export type SkillFile = { name: string; text: string; sha256: string };
export type LoadedSkill = { name: SkillName; source: string; sha256: string; files: SkillFile[] };

/** A skill that cannot be used; the message is plain enough to show as a job failure. */
export class SkillError extends Error {}

const MAX_BYTES = 64 * 1024;
// C0 controls except tab, newline and carriage return.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

function readFile(dir: string, skill: SkillName, name: string): SkillFile {
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(dir, skill, name));
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    // A directory, a permission problem or a loop is still the owner's to fix, in plain words.
    throw new SkillError(
      missing
        ? `The ${skill} skill isn't installed.`
        : `The ${skill} skill file ${name} can't be read.`,
    );
  }
  if (bytes.length > MAX_BYTES)
    throw new SkillError(`The ${skill} skill file ${name} is too large.`);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SkillError(`The ${skill} skill file ${name} is not UTF-8 text.`);
  }
  if (CONTROL.test(text)) {
    throw new SkillError(`The ${skill} skill file ${name} contains a control character.`);
  }
  return { name, text, sha256: hash(text) };
}

function sourceOf(dir: string, skill: SkillName): string {
  try {
    return (
      readFileSync(join(dir, skill, "SOURCE"), "utf8")
        .split("\n")[0]
        ?.trim()
        .slice(0, 300) || "unknown source"
    );
  } catch {
    return "unknown source"; // a hand-made skill has no SOURCE line; the hashes still identify it
  }
}

/** Reads a skill's instruction files from `dir`; refuses anything missing, oversize or odd. */
export function loadSkill(dir: string, name: SkillName): LoadedSkill {
  // Names reach here from jobs; only the three known skills may become a path.
  if (!Object.hasOwn(SKILL_FILES, name))
    throw new SkillError("That skill is not one Harbour uses.");
  const files = SKILL_FILES[name].map((file) => readFile(dir, name, file));
  return {
    name,
    source: sourceOf(dir, name),
    sha256: hash(files.map((f) => f.text).join("\n")),
    files,
  };
}

/** What a gate result and a job event record about the skill that shaped a run. */
export function skillRecord(skill: LoadedSkill): {
  name: SkillName;
  source: string;
  sha256: string;
} {
  return { name: skill.name, source: skill.source, sha256: skill.sha256 };
}
