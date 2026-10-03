import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { inspectRun, snapshotRun } from "./brain-git";

const research = { prefixes: ["research/"], exact: [] };

describe("inspectRun after the agent changed git metadata", () => {
  it("reports the tampering without running git, so a planted filter never runs", () => {
    const b = makeGitBrain({ "research/a.md": "# A\n" });
    const outside = mkdtempSync(join(tmpdir(), "harbour-filter-"));
    const ran = join(outside, "filter-ran");
    try {
      const snap = snapshotRun(b.root);
      // What an agent able to write .git/config and .gitattributes could plant.
      appendFileSync(join(b.root, ".git/config"), `[filter "planted"]\n\tclean = touch ${ran}\n`);
      writeFileSync(join(b.root, ".gitattributes"), "* filter=planted\n");
      // Same size, new mtime: git status must read the content, through the clean filter.
      writeFileSync(join(b.root, "research/a.md"), "# B\n");
      const later = new Date(Date.now() + 5000);
      utimesSync(join(b.root, "research/a.md"), later, later);
      const inspected = inspectRun(b.root, snap, research, "all");
      expect(inspected.gitTampered).toEqual([".git/config"]);
      expect(existsSync(ran)).toBe(false);
    } finally {
      b.cleanup();
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
