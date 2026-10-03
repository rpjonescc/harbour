import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanContent } from "@/lib/content/read/scan";
import { makeBrain } from "@/tests/helpers/brain";
import { ACME, ACME_TOOLS, ideaFile, pieceFile } from "@/tests/helpers/content";
import { towerConfig } from "@/tests/helpers/tower";
import { approvedSince, contentCounts } from "./content-counts";
import { towerContentScan } from "./content-data";

const docs = (slug: string) => `acme-docs-20261002-${slug}`;
const idea = (id: string, state: string, productId = "acme-docs") => ({
  [`content/ideas/${productId}/${id}.md`]: ideaFile({ state, productId }),
});
const piece = (id: string, platform: "linkedin" | "x" | "blog", over: Record<string, unknown>) => ({
  [`content/pieces/${id}/${platform}.md`]: pieceFile(id, platform, over),
});

const brain = makeBrain({
  ...idea(docs("a"), "drafted"),
  ...piece(docs("a"), "linkedin", { state: "ready" }),
  ...piece(docs("a"), "x", { state: "needs-you" }),
  ...piece(docs("a"), "blog", { state: "approved", approvedAt: "2026-09-30" }),
  ...idea(docs("b"), "drafting"), // picked, no pieces yet: being written
  ...idea(docs("c"), "idea"),
  ...idea(docs("d"), "discarded"),
  ...idea("acme-tools-20261001-e", "drafted", "acme-tools"),
  ...piece("acme-tools-20261001-e", "linkedin", {
    state: "approved",
    approvedAt: "2026-09-20",
    productId: "acme-tools",
  }),
  ...piece("acme-tools-20261001-e", "blog", { state: "drafting", productId: "acme-tools" }),
});

const elsewhere = mkdtempSync(join(tmpdir(), "harbour-tower-content-"));
/** Content on, reading the brain at `root`; the other folders live elsewhere. */
const contentOn = (root: string) =>
  towerConfig(elsewhere, { HARBOUR_CONTENT: "on", HARBOUR_BRAIN_DIR: root });

afterAll(() => {
  brain.cleanup();
  rmSync(elsewhere, { recursive: true, force: true });
});

describe("contentCounts", () => {
  const scan = scanContent(brain.root, [ACME, ACME_TOOLS], { gates: false });

  it("counts every product's pieces and ideas by state", () => {
    expect(contentCounts(scan)).toEqual({ ready: 1, needsYou: 1, writing: 2, ideas: 1 });
  });

  it("counts one product's", () => {
    expect(contentCounts(scan, "acme-docs")).toEqual({
      ready: 1,
      needsYou: 1,
      writing: 1,
      ideas: 1,
    });
    expect(contentCounts(scan, "acme-tools")).toEqual({
      ready: 0,
      needsYou: 0,
      writing: 1,
      ideas: 0,
    });
  });

  it("counts pieces approved since a day", () => {
    expect(approvedSince(scan, "2026-09-26")).toBe(1);
    expect(approvedSince(scan, "2026-09-01")).toBe(2);
  });

  it("is a gap, never zeros, when a folder could not be read", () => {
    const broken = { ...scan, folderError: true };
    expect(contentCounts(broken)).toBeNull();
    expect(approvedSince(broken, "2026-09-01")).toBeNull();
  });
});

describe("towerContentScan", () => {
  it("reads nothing when content is off", () => {
    expect(towerContentScan(towerConfig(elsewhere), [ACME])).toBeNull();
  });

  it("reads once and keeps the answer 15 seconds", () => {
    const config = contentOn(brain.root);
    const first = towerContentScan(config, [ACME], 1_000);
    expect(first?.entries).toHaveLength(4);
    expect(towerContentScan(config, [ACME], 15_999)).toBe(first);
    expect(towerContentScan(config, [ACME], 16_000)).not.toBe(first);
  });

  it("says a folder could not be read rather than reporting none", () => {
    const locked = makeBrain({ ...idea(docs("z"), "idea") });
    const folder = join(locked.root, "content/ideas/acme-docs");
    chmodSync(folder, 0o000);
    try {
      const scan = towerContentScan(contentOn(locked.root), [ACME], 0);
      expect(scan?.folderError).toBe(true);
      expect(scan && contentCounts(scan)).toBeNull();
    } finally {
      chmodSync(folder, 0o755);
      locked.cleanup();
    }
  });
});
