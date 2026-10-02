import { runDigestJob } from "@/lib/content/worker/digest-job";
import { enqueueJob } from "@/lib/jobs/queue";
import { HOSTILE_SNIPPETS } from "@/tests/fixtures/content/hostile-snippets";
import { ACME, contentSetup } from "./content";
import { type FakeMode, type FakeSnippet, startFakeScreenpipe } from "./fake-screenpipe";
import { claim, reload } from "./run-job";

export const DIGEST_DAY = "2026-10-01";
export const GOOD_THEMES = [
  {
    productId: "acme-docs",
    text: "Rewrote the getting-started guide around a short first deploy.",
    kind: "built",
  },
  {
    productId: "acme-docs",
    text: "Fixed the sidebar so long page titles wrap properly.",
    kind: "fixed",
  },
];

/**
 * One digest job end to end: the real runner, the real Screenpipe client against the fake server
 * (serving `snippets`, the hostile ones by default) and the fake `claude` replaying `works`.
 */
export async function digest(
  options: {
    mode?: FakeMode;
    works?: unknown;
    /** The fake CLI's fixtures by step, instead of `works` for the digest step. */
    fixtures?: Record<string, unknown>;
    strays?: Record<string, string>;
    snippets?: FakeSnippet[];
    files?: Record<string, string>;
    day?: string;
    /** Content on for a second product, so the job makes two activity requests. */
    twoProducts?: boolean;
    echo?: { text: string; hostile?: boolean };
    /** Runs right after the agent process ends, before the job's own checks (to stage a failure). */
    afterAgent?: (root: string) => void;
  } = {},
) {
  const fake = await startFakeScreenpipe({
    mode: options.mode,
    snippets:
      options.snippets ??
      HOSTILE_SNIPPETS.map((s) => ({
        text: s.text,
        app_name: s.app,
        window_name: s.window,
      })),
  });
  const s = contentSetup(
    options.fixtures ?? { digest: options.works ?? { themes: GOOD_THEMES } },
    options.files,
    { strays: options.strays, echo: options.echo },
  );
  if (options.twoProducts && s.deps.content) {
    s.deps.content.products = [
      ACME,
      { ...ACME, id: "acme-blog", name: "Acme Blog", terms: ["acme blog"] },
    ];
  }
  const { afterAgent } = options;
  if (afterAgent) {
    const run = s.deps.run;
    s.deps.run = async (o) => {
      const outcome = await run(o);
      afterAgent(s.brain.root);
      return outcome;
    };
  }
  const deps = {
    ...s.deps,
    timeZone: "Europe/London",
    screenpipe: { baseUrl: fake.url, apiKey: "sp-test-key" },
  };
  enqueueJob(s.deps.db, "content-digest", { day: options.day ?? DIGEST_DAY }, null);
  const job = claim(s.deps);
  await runDigestJob(deps, job);
  return {
    ...s,
    fake,
    job: reload(s.deps, job.id),
    cleanup: async () => {
      await fake.close();
      s.cleanup();
    },
  };
}
