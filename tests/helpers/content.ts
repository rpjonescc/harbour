import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  options: { strays?: Record<string, string>; skills?: Record<string, string | null> } = {},
) {
  const skills = makeSkillsDir(options.skills);
  const s = setup("content-work", files);
  s.deps.content = { root: s.brain.root, skillsDir: skills.dir, products: [ACME], excludeApps: [] };
  const calls: { prompt: string; tools: string }[] = [];
  const run = s.deps.run;
  s.deps.run = (o) => {
    calls.push({ prompt: o.stdin ?? "", tools: o.args[o.args.indexOf("--tools") + 1] ?? "" });
    const env = {
      ...o.env,
      FAKE_CLAUDE_WORKS: JSON.stringify(works),
      FAKE_CLAUDE_STRAYS: JSON.stringify(options.strays ?? {}),
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
