import type { Platform } from "./ids";
import { allText } from "./piece-text";
import { linkProblem } from "./sanitise";
import type { Finding } from "./schema";
import { contentSchemas, type PieceContent } from "./shapes";
import type { VoiceProfile } from "./voice";

const HOOK_MAX = 210;
const MAX_FINDINGS = 20;
const find = (pattern: string, quote: string, fix: string): Finding => ({
  pattern,
  quote: quote.slice(0, 200),
  fix: fix.slice(0, 200),
});
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (word: string) =>
  new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(word)}(?![A-Za-z0-9])`, "i");

// British spelling first, American second: a small list of the words a US-trained writer slips on.
const GB = [
  ["colour", "color"],
  ["organise", "organize"],
  ["favourite", "favorite"],
  ["centre", "center"],
  ["realise", "realize"],
  ["behaviour", "behavior"],
  ["analyse", "analyze"],
] as const;

function spelling(text: string, variant: VoiceProfile["spelling"]): Finding[] {
  return GB.flatMap(([gb, us]) => {
    const [wrong, right] = variant === "en-US" ? [gb, us] : [us, gb];
    return wordRe(wrong).test(text)
      ? [find("Spelling", wrong, `Write "${right}" (${variant})`)]
      : [];
  });
}

function policy(text: string, voice: VoiceProfile): Finding[] {
  const out: Finding[] = [];
  // (c), (r) and (tm) are in the pictographic class but are not emoji a writer chose.
  const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).filter(
    (c) => !["\u00a9", "\u00ae", "\u2122"].includes(c),
  );
  if (emoji.length > (voice.emoji === "sparing" ? 1 : 0)) {
    const fix = voice.emoji === "none" ? "Remove the emoji" : "Keep to one emoji";
    out.push(find("Emoji", emoji[0] ?? "", fix));
  }
  const bangs = (text.match(/[!\uff01]/g) ?? []).length;
  if (bangs > (voice.exclamations === "rare" ? 1 : 0)) {
    const fix =
      voice.exclamations === "none"
        ? "Remove the exclamation marks"
        : "Keep to one exclamation mark";
    out.push(find("Exclamation mark", "!", fix));
  }
  return out;
}

function words(text: string, voice: VoiceProfile, factsText: string): Finding[] {
  // A word the facts pack already writes in capitals (an acronym the product uses) is not shouting.
  const caps = (text.match(/\b[A-Z]{4,}\b/g) ?? []).filter(
    (w) => !new RegExp(`\\b${w}\\b`).test(factsText),
  );
  const out = caps.slice(0, 3).map((w) => find("Shouting", w, "Write it in lower case"));
  // A camel-case hashtag is words run together: "#SolutionFinder" holds "Solution".
  const spaced = text.replace(/#[\p{L}\p{N}_]+/gu, (tag) =>
    tag.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " "),
  );
  for (const term of [...voice.wordsWeAvoid, ...voice.topicsToAvoid]) {
    if (wordRe(term).test(spaced))
      out.push(find("Avoided word", term, "Use a plainer word, or leave it out"));
  }
  return out;
}

// Caps, hashtag counts and the last X post with its hashtag are the shape's checks (run first).
type Loose = Record<string, unknown> & { hashtags?: string[] };

function platformRules(platform: Platform, content: PieceContent): Finding[] {
  const c = content as Loose;
  if (platform === "linkedin") {
    const hook = String(c.text).split("\n")[0] ?? "";
    if (hook.length <= HOOK_MAX) return [];
    return [
      find("Hook too long", hook, `Shorten the first line by ${hook.length - HOOK_MAX} characters`),
    ];
  }
  if (platform === "instagram") {
    // No host is allowed: a caption cannot hold a clickable link.
    return linkProblem(String(c.caption), []) === null
      ? []
      : [find("Link in an Instagram caption", "link", "Remove the link: captions cannot hold one")];
  }
  return [];
}

/** The platform gate (spec §8.3 d): the shape, then the platform's own rules, then the voice profile's. */
export function checkPlatform(input: {
  platform: Platform;
  content: PieceContent;
  voice: VoiceProfile;
  factsText: string;
}): Finding[] {
  const { platform, content, voice, factsText } = input;
  const shaped = contentSchemas[platform].safeParse(content);
  if (!shaped.success) {
    return shaped.error.issues
      .slice(0, 5)
      .map((i) =>
        find(
          "Doesn't fit the platform",
          "",
          `${i.path.map(String).join(".") || "The piece"} ${i.message}`,
        ),
      );
  }
  const text = allText(content);
  return [
    ...platformRules(platform, content),
    ...policy(text, voice),
    ...words(text, voice, factsText),
    ...spelling(text, voice.spelling),
  ].slice(0, MAX_FINDINGS);
}
