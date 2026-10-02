import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS } from "@/lib/content/ids";
import { sanitiseContent } from "@/lib/content/sanitise";
import { gateInputs } from "@/lib/content/worker/gate-inputs";
import { notesMissingMessage } from "@/lib/explain/content";
import { eventsSince } from "@/lib/jobs/queue";
import { makeBrain } from "@/tests/helpers/brain";
import { seedPieces } from "@/tests/helpers/chain";
import {
  ACME,
  ACME_TOOLS,
  contentSetup,
  digestFile,
  ideaFile,
  PIECES,
  pieceFile,
  VOICE_ACME,
} from "@/tests/helpers/content";
import { openTestDb } from "@/tests/helpers/db";
import { DIGEST_DAY, digest } from "@/tests/helpers/digest-run";
import { runOne } from "@/tests/helpers/run-job";
import { renderExport } from "./export";
import { countReadyPieces } from "./read/ready-count";
import { contentView } from "./read/view";

const VOICE_TOOLS = VOICE_ACME.replace("product: acme-docs", "product: acme-tools");
const IDEA = "acme-tools-20261001-five-minutes";
const NOW = { today: "2026-10-02", tokenSet: true };

describe("a content-only project in the content machine", () => {
  it("has no allowed link host, so every link in a piece is rejected", () => {
    const linked = { ...PIECES.linkedin, text: "Read https://docs.example.com/guide today" };
    expect(sanitiseContent("linkedin", linked, ACME.allowedHosts).ok).toBe(true);
    for (const text of [
      "Read https://docs.example.com/guide today",
      "Read docs.example.com today",
      "Read www.acme-tools.dev today",
    ]) {
      expect(
        sanitiseContent("linkedin", { ...PIECES.linkedin, text }, ACME_TOOLS.allowedHosts).ok,
      ).toBe(false);
    }
  });

  it("gives the gates no host, and finds the project from its idea id", () => {
    const files = {
      "content/voices/acme-tools.md": VOICE_TOOLS,
      ...seedPieces(IDEA),
    };
    const brain = makeBrain(files);
    try {
      const content = {
        root: brain.root,
        skillsDir: "/unused",
        products: [ACME, ACME_TOOLS],
        excludeApps: [],
        approvedPillars: () => [],
      };
      const inputs = gateInputs(content, IDEA, { gate: "no-ai-slop", attempt: 1 });
      expect(inputs.product.id).toBe("acme-tools");
      expect(inputs.hosts).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });

  it("writes ideas for it under content/ideas/<id>/, with no URL in the prompt", async () => {
    const idea = {
      title: "Five minutes to a first deploy",
      pillar: null,
      angle: "Show the shortest path.",
      audienceQuestion: "How long does it take?",
      why: "You built this this week.",
      sources: ["product:acme-tools"],
    };
    const s = contentSetup(
      { ideas: { ideas: [idea] } },
      {
        "content/voices/acme-tools.md": VOICE_TOOLS,
        "products/acme-tools/notes.md": "# Acme Tools\n\nSmall teams.\n",
      },
    );
    if (s.deps.content) s.deps.content.products = [ACME_TOOLS];
    try {
      const job = await runOne(s.deps, "content-ideas", { productId: "acme-tools" });
      expect(job).toMatchObject({ status: "ok", error: null });
      const path = "content/ideas/acme-tools/acme-tools-20261001-five-minutes-to-a-first-deploy.md";
      expect(readFileSync(join(s.brain.root, path), "utf8")).toContain("productId: acme-tools");
      expect(s.calls[0]?.prompt).toContain("[product:acme-tools] Acme Tools");
      expect(s.calls[0]?.prompt).not.toMatch(/https?:|\(null\)|at null/);
    } finally {
      s.cleanup();
    }
  });

  it("fails ideas with a plain sentence, not a path, when the notes file is missing", async () => {
    const s = contentSetup({}, { "content/voices/acme-tools.md": VOICE_TOOLS });
    if (s.deps.content) s.deps.content.products = [ACME_TOOLS];
    try {
      const job = await runOne(s.deps, "content-ideas", { productId: "acme-tools" });
      expect(job.status).toBe("failed");
      expect(job.error).toBe(notesMissingMessage("Acme Tools", "acme-tools"));
      expect(job.error).not.toMatch(/Missing /);
    } finally {
      s.cleanup();
    }
  });

  it("tells the Content page when a project's notes are missing, and not when they exist", () => {
    const notes = { "products/acme-tools/notes.md": "# Acme Tools\n" };
    for (const [files, missing] of [
      [{ "content/voices/acme-tools.md": VOICE_TOOLS }, true],
      [{ "content/voices/acme-tools.md": VOICE_TOOLS, ...notes }, false],
    ] as const) {
      const brain = makeBrain(files);
      try {
        const v = contentView({
          db: openTestDb(),
          root: brain.root,
          products: [ACME_TOOLS],
          ...NOW,
        });
        expect(v.voice[0]).toMatchObject({ state: "ok", notesMissing: missing });
      } finally {
        brain.cleanup();
      }
    }
  });

  it("refuses ideas for a project that is not configured", async () => {
    const s = contentSetup({}, { "content/voices/acme-tools.md": VOICE_TOOLS });
    try {
      const job = await runOne(s.deps, "content-ideas", { productId: "acme-tools" });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/not set up for content/);
    } finally {
      s.cleanup();
    }
  });

  it("is digested with its own terms and counted by name", async () => {
    const r = await digest({
      products: [ACME_TOOLS],
      works: {
        themes: [{ productId: "acme-tools", text: "Added a plain sentence here", kind: "built" }],
      },
      snippets: [
        { text: "Acme Tools: wrote the changelog", app_name: "Editor", window_name: "log.md" },
      ],
    });
    try {
      expect(r.job.status).toBe("ok");
      const events = eventsSince(r.deps.db, r.job.id, 0).map((e) => e.text);
      expect(events.some((t) => /for acme-tools; \d+ kept after filtering/.test(t))).toBe(true);
      expect(
        readFileSync(join(r.brain.root, `content/digests/${DIGEST_DAY}.md`), "utf8"),
      ).toContain("acme-tools");
    } finally {
      await r.cleanup();
    }
  });

  it("shows on the Content page with its name, counts and voice status", () => {
    const files = {
      "content/voices/acme-tools.md": VOICE_TOOLS,
      "content/digests/2026-10-01.md": digestFile("2026-10-01", [
        ["acme-tools", "Wrote the changelog for the last release."],
      ]),
      [`content/ideas/acme-tools/${IDEA}.md`]: ideaFile({
        state: "drafted",
        productId: "acme-tools",
        sources: ["product:acme-tools"],
      }),
      ...Object.fromEntries(
        PLATFORMS.map((p) => [
          `content/pieces/${IDEA}/${p}.md`,
          pieceFile(IDEA, p, { state: "ready" }),
        ]),
      ),
    };
    const brain = makeBrain(files);
    try {
      const v = contentView({ db: openTestDb(), root: brain.root, products: [ACME_TOOLS], ...NOW });
      expect(v.tabs.find((t) => t.id === "ready")?.count).toBe(6);
      expect(v.ideas[0]).toMatchObject({ id: IDEA, productName: "Acme Tools" });
      expect(v.voice.map((x) => x.productId)).toEqual(["acme-tools"]);
      expect(countReadyPieces(brain.root, [ACME_TOOLS])).toBe(6);
    } finally {
      brain.cleanup();
    }
  });

  it("says the voice profile is missing, by the project's name", () => {
    const brain = makeBrain({});
    try {
      const v = contentView({ db: openTestDb(), root: brain.root, products: [ACME_TOOLS], ...NOW });
      expect(JSON.stringify(v.voice)).toContain("Acme Tools");
    } finally {
      brain.cleanup();
    }
  });

  it("exports with the project id as `product`", () => {
    const text = renderExport({
      title: "T",
      product: "acme-tools",
      platform: "linkedin",
      approved: "2026-10-02",
      idea: IDEA,
      content: PIECES.linkedin,
    });
    expect(text).toMatch(/^---\ntitle: .*\nproduct: acme-tools\n/);
  });
});
