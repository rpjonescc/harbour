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
import { connectionOf, type Db } from "@/lib/db/client";
import { ACME, FIXTURE_SKILL_TEXT } from "./content-fixtures";
import { setup } from "./run-job";

export * from "./content-fixtures";

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
