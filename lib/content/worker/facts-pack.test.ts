import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { IdeaFront } from "@/lib/content/schema";
import { makeBrain } from "@/tests/helpers/brain";
import { ACME, digestFile } from "@/tests/helpers/content";
import { buildFactsPack, FACTS_PACK_BYTES, FactsPackError, factsPackText } from "./facts-pack";

const idea = (sources: string[], pillar: string | null = null): IdeaFront => ({
  title: "Five minutes to a first deploy",
  kind: "content-idea",
  productId: "acme-docs",
  state: "idea",
  pillar,
  angle: "a",
  audienceQuestion: "b",
  why: "c",
  sources,
  needsYou: null,
  created: "2026-10-02",
  createdBy: "job-1",
});
const build = (root: string, sources: string[] = ["product:acme-docs"]) =>
  buildFactsPack({ root, product: ACME, pillars: [], idea: idea(sources) });
const put = (root: string, rel: string, bytes: string | Buffer) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), bytes);
};
const NOTES = "products/acme-docs/notes.md";

describe("buildFactsPack", () => {
  it("holds the product, the cited theme, the notes and the cited documents, each under its ref", () => {
    const { root, cleanup } = makeBrain({
      "products/acme-docs/notes.md": "Small teams. Free plan has three projects.\n",
      "research/seo/answers.md": "Answer-first pages get quoted.\n",
      "content/digests/2026-10-01.md": digestFile("2026-10-01", [
        ["acme-docs", "Rewrote the getting-started guide around a short first deploy."],
      ]),
    });
    try {
      const pack = buildFactsPack({
        root,
        product: ACME,
        pillars: [{ key: "getting-started", name: "Getting started", description: "Short paths." }],
        idea: idea(
          ["digest:2026-10-01#t1", "brain:research/seo/answers.md", "pillar:getting-started"],
          "getting-started",
        ),
      });
      expect(pack.map((f) => f.ref)).toEqual([
        "product:acme-docs",
        "pillar:getting-started",
        "digest:2026-10-01#t1",
        "brain:products/acme-docs/notes.md",
        "brain:research/seo/answers.md",
      ]);
      expect(factsPackText(pack)).toContain("[digest:2026-10-01#t1]");
      expect(factsPackText(pack)).toContain("Free plan has three projects");
    } finally {
      cleanup();
    }
  });

  it("caps the whole pack, keeps secrets and absolute paths out, and ignores refs outside products/ and research/", () => {
    const { root, cleanup } = makeBrain({
      "products/acme-docs/notes.md": `Mail sam@example.com, file /ho${"me"}/sam/notes.md. ${"word ".repeat(30_000)}`,
      "content/voices/acme-docs.md": "voice",
      "secrets.md": "hidden",
    });
    try {
      const pack = buildFactsPack({
        root,
        product: ACME,
        pillars: [],
        idea: idea(["brain:content/voices/acme-docs.md", "brain:secrets.md"]),
      });
      const text = factsPackText(pack);
      expect(text.length).toBeLessThanOrEqual(FACTS_PACK_BYTES + 2000); // the labels are not counted in the cap
      expect(pack.some((f) => f.truncated)).toBe(true);
      expect(text).not.toContain("sam@example.com");
      expect(text).not.toContain("/home/sam");
      expect(text).not.toContain("voice");
      expect(text).not.toContain("hidden");
    } finally {
      cleanup();
    }
  });

  it("counts the cap in bytes, so multi-byte text cannot push the pack past 48 KiB", () => {
    const { root, cleanup } = makeBrain({});
    try {
      for (let i = 0; i < 9; i += 1) put(root, `research/r${i}.md`, "é".repeat(3000));
      const pack = build(
        root,
        Array.from({ length: 8 }, (_, i) => `brain:research/r${i}.md`),
      );
      const bytes = pack.reduce((n, f) => n + Buffer.byteLength(f.text), 0);
      expect(bytes).toBeLessThanOrEqual(FACTS_PACK_BYTES);
      expect(pack.every((f) => !f.text.includes("�"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("reads each source once however often it is cited, and treats a missing one as a gap", () => {
    const { root, cleanup } = makeBrain({ [NOTES]: "Notes.\n" });
    try {
      const pack = build(root, [
        `brain:${NOTES}`,
        `brain:${NOTES}`,
        "brain:research/gone.md",
        "digest:2026-01-01#t1",
      ]);
      expect(pack.map((f) => f.ref)).toEqual(["product:acme-docs", `brain:${NOTES}`]);
    } finally {
      cleanup();
    }
  });

  it("leaves out another product's notes, another product's theme and hidden files", () => {
    const { root, cleanup } = makeBrain({
      [NOTES]: "Mine.\n",
      "products/other/notes.md": "Theirs.\n",
      "research/.secret.md": "Hidden.\n",
      "content/digests/2026-10-01.md": digestFile("2026-10-01", [
        ["other", "Rewrote the other product's guide around a short first deploy."],
      ]),
    });
    try {
      const pack = build(root, [
        "brain:products/other/notes.md",
        "brain:research/.secret.md",
        "digest:2026-10-01#t1",
      ]);
      expect(pack.map((f) => f.ref)).toEqual(["product:acme-docs", `brain:${NOTES}`]);
    } finally {
      cleanup();
    }
  });

  it("removes hidden characters before redacting, so an email split by one cannot survive", () => {
    const { root, cleanup } = makeBrain({
      [NOTES]: "Write to sam@exam\u200bple.com or call 1\u200b2 people.\r\nNext line.\n",
    });
    try {
      const text = factsPackText(build(root));
      expect(text).toContain("[email]");
      expect(text).not.toContain("sam@");
      expect(text).toContain("12 people");
      expect(text).not.toContain("\r");
    } finally {
      cleanup();
    }
  });

  it("keeps a character that a size cut would have split", () => {
    const { root, cleanup } = makeBrain({ [NOTES]: `${"a".repeat(6 * 1024 - 1)}étail` });
    try {
      const text = factsPackText(build(root));
      expect(text).not.toContain("�");
      expect(text).toContain("(cut short)");
    } finally {
      cleanup();
    }
  });

  describe("fails closed, in fixed words, when a source is there but unusable", () => {
    const refuses = (setup: (root: string) => void, sources?: string[]) => {
      const { root, cleanup } = makeBrain({ "products/acme-docs/other.md": "x" });
      try {
        setup(root);
        expect(() => build(root, sources)).toThrow(FactsPackError);
        try {
          build(root, sources);
        } catch (error) {
          expect((error as Error).message).not.toMatch(/notes\.md|digest|\/|secret/i);
        }
      } finally {
        cleanup();
      }
    };
    it("a note that is a symlink", () =>
      refuses((root) => {
        put(root, "research/real.md", "Real.");
        symlinkSync(join(root, "research/real.md"), join(root, NOTES));
      }));
    it("a note that is a pipe", () =>
      refuses((root) => {
        mkdirSync(join(root, "products/acme-docs"), { recursive: true });
        execFileSync("mkfifo", [join(root, NOTES)]);
      }));
    it("a note that is not UTF-8", () =>
      refuses((root) => put(root, NOTES, Buffer.from([0xff, 0xfe, 0x41]))));
    it("a note with a control character", () =>
      refuses((root) => put(root, NOTES, "Fine\u0007 text")));
    it("a cited note that is a folder", () =>
      refuses(
        (root) => mkdirSync(join(root, "research/dir.md"), { recursive: true }),
        ["brain:research/dir.md"],
      ));
    it("a digest that is not valid", () =>
      refuses(
        (root) => put(root, "content/digests/2026-10-01.md", "not a digest"),
        ["digest:2026-10-01#t1"],
      ));
    it("a digest that is a symlink", () =>
      refuses(
        (root) => {
          put(root, "research/real.md", "Real.");
          mkdirSync(join(root, "content/digests"), { recursive: true });
          symlinkSync(join(root, "research/real.md"), join(root, "content/digests/2026-10-01.md"));
        },
        ["digest:2026-10-01#t1"],
      ));
  });
});
