import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { renderFile } from "@/lib/content/files";
import type { Platform } from "@/lib/content/ids";
import { renderPiece } from "@/lib/content/render";
import type { ContentOf } from "@/lib/content/shapes";
import { connectionOf, type Db } from "@/lib/db/client";
import type { ContentProduct } from "@/lib/products/content";
import { setup } from "./run-job";

/** Acme Docs with content on, as `harbour.config.json` would list it. */
export const ACME: ContentProduct = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
  kind: "product",
  terms: ["acme docs", "acme-docs"],
  platforms: ["linkedin", "x", "instagram", "facebook", "blog", "website"],
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

/** A temporary skills folder with the fixture files and a SOURCE line per skill. */
export function makeSkillsDir(overrides: Record<string, string | null> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "harbour-skills-"));
  const files: Record<string, string | null> = {
    ...FIXTURE_SKILL_TEXT,
    "no-ai-slop/SOURCE":
      "Source: https://example.com/no-ai-slop @ aaaaaaa (installed 2026-10-02)\n",
    "humanizer/SOURCE": "Source: https://example.com/humanizer @ bbbbbbb (installed 2026-10-02)\n",
    "atomizer/SOURCE": "Source: https://example.com/atomizer @ ccccccc (installed 2026-10-02)\n",
    ...overrides,
  };
  for (const [path, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * `setup` for a content step: the fake CLI replays `works` (STEP line to work-file JSON), the
 * run context holds Acme Docs and a fixture skills folder, and every prompt (read from stdin) and
 * tool list is recorded in `calls`.
 */
export function contentSetup(
  works: Record<string, unknown>,
  files: Record<string, string> = {},
  options: {
    strays?: Record<string, string>;
    skills?: Record<string, string | null>;
    /** The fake CLI repeats this string through every channel; `hostile` also writes outside the brain and puts it in the work file as a JSON key. */
    echo?: { text: string; hostile?: boolean };
  } = {},
) {
  const skills = makeSkillsDir(options.skills);
  const s = setup("content-work", files);
  s.deps.content = {
    root: s.brain.root,
    skillsDir: skills.dir,
    products: [ACME],
    excludeApps: [],
    approvedPillars: () => [],
  };
  const calls: { prompt: string; tools: string; args: string[] }[] = [];
  const run = s.deps.run;
  s.deps.run = (o) => {
    calls.push({
      prompt: o.stdin ?? "",
      tools: o.args[o.args.indexOf("--tools") + 1] ?? "",
      args: o.args,
    });
    const env = {
      ...o.env,
      FAKE_CLAUDE_WORKS: JSON.stringify(works),
      FAKE_CLAUDE_STRAYS: JSON.stringify(options.strays ?? {}),
      ...(options.echo
        ? {
            FAKE_CLAUDE_ECHO: options.echo.text,
            ...(options.echo.hostile ? { FAKE_CLAUDE_ECHO_HOSTILE: "1" } : {}),
          }
        : {}),
    };
    return run({ ...o, env });
  };
  return {
    ...s,
    calls,
    cleanup: () => {
      s.brain.cleanup();
      skills.cleanup();
    },
  };
}

/** Paths of files under `roots` (and `extra` texts, reported as "(text N)") that contain `needle`. */
export function searchEverywhere(needle: string, roots: string[], extra: string[] = []): string[] {
  const hits: string[] = [];
  const walk = (path: string) => {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) walk(join(path, name));
      return;
    }
    // A large file is read whole too: a leak is a leak at any size.
    if (readFileSync(path).includes(needle)) hits.push(path);
  };
  for (const root of roots) walk(root);
  extra.forEach((text, i) => {
    if (text.includes(needle)) hits.push(`(text ${i})`);
  });
  return hits;
}

/** Every table of the database as JSON, for "this string is stored nowhere" assertions. */
export function dumpDb(db: Db): string {
  const client = connectionOf(db);
  const tables = client.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
    name: string;
  }[];
  return JSON.stringify(
    tables.map(({ name }) => [name, client.prepare(`SELECT * FROM "${name}"`).all()]),
  );
}

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
export const tags = (n: number) => Array.from({ length: n }, (_, i) => `#tag${i}`);

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

/** A valid piece file (drafting, revision 1, every gate pending) for `ideaId` and `platform`. */
export function pieceFile(ideaId: string, platform: Platform = "linkedin"): string {
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
    },
    renderPiece(platform, content),
  );
}
