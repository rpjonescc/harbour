import { renderFile } from "@/lib/content/files";
import { PLATFORMS, type Platform } from "@/lib/content/ids";
import { renderPiece } from "@/lib/content/render";
import type { ContentOf } from "@/lib/content/shapes";
import type { ContentProduct } from "@/lib/products/content";

// Data only, with no test runner or worker imports: the E2E spec and its prepare script (which
// Playwright and tsx load) import this file, and `content.ts` re-exports it for the unit tests.

/** Acme Docs with content on, as `harbour.config.json` would list it. */
export const ACME: ContentProduct = {
  id: "acme-docs",
  name: "Acme Docs",
  kind: "site",
  url: "https://docs.example.com",
  allowedHosts: ["docs.example.com"],
  terms: ["acme docs", "acme-docs"],
  platforms: ["linkedin", "x", "instagram", "facebook", "blog", "website"],
};

/** Acme Tools, a project with no website: content only, so no URL and no allowed link host. */
export const ACME_TOOLS: ContentProduct = {
  id: "acme-tools",
  name: "Acme Tools",
  kind: "project",
  url: null,
  terms: ["acme tools", "acme-tools"],
  platforms: ["linkedin", "blog"],
  allowedHosts: [],
};

const sample = (extra: string) =>
  `We rebuilt the getting-started guide last week. It used to take a new team about an hour to get from sign-up to a live page, mostly because of two steps buried in the middle. ${extra} You connect your repository, pick a folder and press publish. The page is live before your coffee cools.`;

/** A valid voice profile for `acme-docs`. */
export const VOICE_ACME = `---
product: acme-docs
audience: Small software teams who write their own docs and have no docs person.
person: we
spelling: en-GB
readingLevel: plain
emoji: none
exclamations: none
wordsWeUse: [docs, guide, publish, page]
wordsWeAvoid: [solution, seamless]
topicsToAvoid: [competitor names]
reviewAlways: [pricing]
callsToAction:
  - Try it free at the product URL
linkInBio: false
---

## How we sound

We talk like a colleague who has set this up before. We are direct and a little dry.

## Never

- Promise a feature that is not shipped.

## Samples

${sample("Now those steps come first.")}

* * *

${sample("We moved them to the top.")}
`;

/** What each fixture skill file holds, so tests can assert a prompt embeds it verbatim. */
export const FIXTURE_SKILL_TEXT = {
  "no-ai-slop/SKILL.md":
    "# Fixture no-ai-slop\n\nEdit job: cut filler. Detect job: name patterns.\n",
  "no-ai-slop/eval.md": "# Fixture eval\n\nPass or fail each check.\n",
  "humanizer/SKILL.md": "# Fixture humanizer\n\nRemove AI tells. Return remaining patterns.\n",
  "atomizer/SKILL.md": "# Fixture atomizer\n\nSource job. Atomise job.\n",
  "atomizer/platforms.md": "# Fixture platforms\n\nLinkedIn: short.\n",
  "atomizer/voice-profile.md": "# Fixture voice profile\n\nFormat.\n",
} as const;

/** A valid idea file (state `idea`, one source); `over` overrides frontmatter fields. */
export const ideaFile = (over: Record<string, unknown> = {}) =>
  renderFile(
    {
      title: "Five minutes to a first deploy",
      kind: "content-idea",
      productId: "acme-docs",
      state: "idea",
      pillar: null,
      angle: "Show the shortest path.",
      audienceQuestion: "How long does it take?",
      why: "You rebuilt this guide this week.",
      sources: ["product:acme-docs"],
      needsYou: null,
      created: "2026-10-02",
      createdBy: "job-1",
      ...over,
    },
    "Body.",
  );

/** A digest file for `day` with `[productId, text]` themes numbered t1.. */
export function digestFile(day: string, themes: [string, string][]): string {
  return renderFile(
    {
      title: `Activity themes ${day}`,
      kind: "content-digest",
      date: day,
      window: { start: `${day}T00:00:00.000Z`, end: `${day}T23:59:59.000Z` },
      status: "ok",
      themes: themes.map(([productId, text], i) => ({
        id: `t${i + 1}`,
        productId,
        text,
        kind: "built",
      })),
    },
    themes.map(([, text]) => `- ${text}`).join("\n"),
  );
}

export const words = (n: number, word = "word") => Array.from({ length: n }, () => word).join(" ");
// Letters, not digits: a digit in a hashtag reads as a number to the facts check.
export const tags = (n: number) =>
  Array.from({ length: n }, (_, i) => `#tag${"abcdefghijkl".charAt(i)}`);

/** One valid piece of content per platform (spec §7.3 shapes). */
export const PIECES: { [P in Platform]: ContentOf<P> } = {
  linkedin: { text: "Docs that ship in five minutes.", hashtags: ["#docs"] },
  x: { posts: ["Ship docs in five minutes."], hashtags: [] },
  instagram: {
    caption: "Five minutes to a first deploy.",
    hashtags: tags(3),
    visual: {
      concept: "A stopwatch beside a laptop",
      onImageText: "5 minutes",
      altText: "A stopwatch",
    },
  },
  facebook: { text: "Our getting-started guide, rebuilt.", hashtags: [] },
  blog: {
    title: "Five minutes to a first deploy",
    metaTitle: "Deploy docs in five minutes",
    metaDescription: "The shortest path from sign-up to a live docs page.",
    slug: "five-minutes-to-a-first-deploy",
    answer: words(45),
    body: words(700),
  },
  website: {
    heading: "Publish docs today",
    body: words(60),
    bullets: ["One page"],
    ctaLabel: "Try it free",
  },
};

/** A valid piece file (drafting, revision 1, every gate pending) for `ideaId` and `platform`; `over` replaces frontmatter fields and `body` the rendered text. */
export function pieceFile(
  ideaId: string,
  platform: Platform = "linkedin",
  over: Record<string, unknown> = {},
  body?: string,
): string {
  const content = PIECES[platform];
  return renderFile(
    {
      title: "Five minutes to a first deploy",
      kind: "content-piece",
      ideaId,
      productId: "acme-docs",
      platform,
      state: "drafting",
      revision: 1,
      gates: { slop: "pending", humanizer: "pending", facts: "pending", platform: "pending" },
      flags: [],
      claims: [],
      questions: [],
      needsYou: null,
      edited: false,
      approvedAt: null,
      exportPath: null,
      content,
      ...over,
    },
    body ?? renderPiece(platform, content),
  );
}

const para = (i: number) => ({
  id: `p${i + 1}`,
  text: Array.from({ length: 100 }, (_, n) => (n % 9 === 8 ? "guide." : "docs")).join(" "),
  facts: ["brain:products/acme-docs/notes.md"],
});
const cleanGate = {
  pieces: PLATFORMS.map((platform) => ({
    platform,
    content: PIECES[platform],
    findings: [],
    questions: [],
  })),
};

/** One fake-CLI fixture per step of a whole chain, each of which passes every check. */
export const CHAIN_WORKS = {
  draft: {
    title: "Five minutes to a first deploy",
    paragraphs: Array.from({ length: 5 }, (_, i) => para(i)),
    questions: [],
  },
  atomise: {
    pieces: PLATFORMS.map((platform) => ({
      platform,
      content: PIECES[platform],
      claims: [{ text: "Docs publish quickly.", trace: "source:p1" }],
      questions: [],
    })),
  },
  "gate:no-ai-slop:1": cleanGate,
  "gate:humanizer:1": cleanGate,
  // The facts agent lists each piece's claims, here all traced to the source's first paragraph.
  "gate:facts:1": {
    pieces: PLATFORMS.map((platform) => ({
      platform,
      claims: [{ text: "Docs publish quickly.", trace: "source:p1" }],
      questions: [],
    })),
  },
  // A revision covers only the pieces that failed; these fixtures are for the `x` piece.
  "gate:no-ai-slop:2": { pieces: cleanGate.pieces.filter((p) => p.platform === "x") },
  "gate:humanizer:2": { pieces: cleanGate.pieces.filter((p) => p.platform === "x") },
};
