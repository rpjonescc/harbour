import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { hasControlChars, hasInvisible } from "@/lib/text/hidden-chars";

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
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Reads a regular file of at most MAX_BYTES, never following a link; size is checked before reading. */
function readBounded(path: string, skill: SkillName, name: string): Buffer {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(fd);
    if (!info.isFile())
      throw new SkillError(`The ${skill} skill file ${name} is not a plain file.`);
    if (info.size > MAX_BYTES)
      throw new SkillError(`The ${skill} skill file ${name} is too large.`);
    const buffer = Buffer.alloc(info.size);
    const read = readSync(fd, buffer, 0, info.size, 0);
    return buffer.subarray(0, read);
  } catch (error) {
    if (error instanceof SkillError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new SkillError(`The ${skill} skill isn't installed.`);
    if (code === "ELOOP") throw new SkillError(`The ${skill} skill file ${name} is a link.`);
    throw new SkillError(`The ${skill} skill file ${name} can't be read.`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readFile(dir: string, skill: SkillName, name: string): SkillFile {
  const bytes = readBounded(join(dir, skill, name), skill, name);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new SkillError(`The ${skill} skill file ${name} is not UTF-8 text.`);
  }
  if (hasControlChars(text, { tab: true, carriageReturn: true })) {
    throw new SkillError(`The ${skill} skill file ${name} contains a control character.`);
  }
  if (hasInvisible(text)) {
    throw new SkillError(`The ${skill} skill file ${name} contains an invisible character.`);
  }
  return { name, text, sha256: hash(text) };
}

/** The first SOURCE line when it is one short line of visible text; otherwise "unknown source". */
function sourceOf(dir: string, skill: SkillName): string {
  try {
    const bytes = readBounded(join(dir, skill, "SOURCE"), skill, "SOURCE");
    const line = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(bytes)
      .split("\n")[0]
      ?.trim();
    if (
      !line ||
      line.length > 300 ||
      hasControlChars(line, { tab: true, carriageReturn: true }) ||
      hasInvisible(line)
    )
      return "unknown source";
    return line;
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
    sha256: hash(files.map((f) => `${f.name}\0${f.sha256}\n`).join("")),
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
