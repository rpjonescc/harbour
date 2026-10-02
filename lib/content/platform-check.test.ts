import { PIECES, VOICE_ACME } from "@/tests/helpers/content";
import { checkPlatform } from "./platform-check";
import { parseVoiceProfile } from "./voice";

const voiceOf = (text = VOICE_ACME) => {
  const parsed = parseVoiceProfile(text, "acme-docs");
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
};
const run = (platform: keyof typeof PIECES, content: unknown, voice = voiceOf(), factsText = "") =>
  checkPlatform({ platform, content: content as never, voice, factsText }).map((f) => f.pattern);

describe("checkPlatform", () => {
  it.each(Object.keys(PIECES) as (keyof typeof PIECES)[])(
    "passes the valid %s fixture",
    (platform) => {
      expect(run(platform, PIECES[platform])).toEqual([]);
    },
  );

  it("reports a shape break in plain words, for every cap the shape holds", () => {
    const [finding] = checkPlatform({
      platform: "linkedin",
      content: { text: "a".repeat(3100), hashtags: [] } as never,
      voice: voiceOf(),
      factsText: "",
    });
    expect(finding?.fix).toMatch(/text is too long: the limit is 3000 characters/);
  });

  it("checks the LinkedIn hook, Instagram caption links, and the last X post with its hashtag", () => {
    expect(run("linkedin", { text: `${"a".repeat(220)} point.`, hashtags: [] })).toContain(
      "Hook too long",
    );
    expect(
      run("instagram", { ...PIECES.instagram, caption: "Read https://docs.example.com now" }),
    ).toContain("Link in an Instagram caption");
    const [tooLong] = checkPlatform({
      platform: "x",
      content: { posts: ["a".repeat(275)], hashtags: ["#docs"] } as never,
      voice: voiceOf(),
      factsText: "",
    });
    expect(tooLong?.fix).toMatch(/too long for X once the hashtag is added/);
  });

  it("applies the voice profile: emoji, exclamation marks, caps, avoided words and topics, spelling", () => {
    const patterns = run(
      "facebook",
      { text: "Our seamless solution is LOUD! 🙂 We love the colour.", hashtags: [] },
      voiceOf(VOICE_ACME.replace("spelling: en-GB", "spelling: en-US")),
    );
    for (const p of ["Emoji", "Exclamation mark", "Shouting", "Avoided word", "Spelling"]) {
      expect(patterns).toContain(p);
    }
  });

  it("allows an ALL-CAPS word the facts pack already uses, and one emoji when the profile allows it", () => {
    expect(
      run(
        "facebook",
        { text: "Works with MCPS servers.", hashtags: [] },
        voiceOf(),
        "Supports MCPS.",
      ),
    ).toEqual([]);
    const sparing = voiceOf(VOICE_ACME.replace("emoji: none", "emoji: sparing"));
    expect(run("facebook", { text: "A tip 🙂 for you.", hashtags: [] }, sparing)).toEqual([]);
    expect(run("facebook", { text: "A tip 🙂 for you 🙂.", hashtags: [] }, sparing)).toContain(
      "Emoji",
    );
  });

  it("flags a hashtag that uses a word the profile avoids", () => {
    expect(run("linkedin", { text: "Good.", hashtags: ["#solution"] })).toContain("Avoided word");
  });

  it("does not call a trademark sign an emoji, and counts a full-width exclamation mark", () => {
    expect(run("facebook", { text: "Acme Docs™ and Acme©.", hashtags: [] })).toEqual([]);
    expect(run("facebook", { text: "Ship it！", hashtags: [] })).toContain("Exclamation mark");
  });

  it("finds an avoided word inside a camel-case hashtag", () => {
    expect(run("linkedin", { text: "Good.", hashtags: ["#SolutionFinder"] })).toContain(
      "Avoided word",
    );
  });
});
