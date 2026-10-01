import { describe, expect, it } from "vitest";
import { scrubGitEnv } from "./git-env";

describe("scrubGitEnv", () => {
  it("removes variables that select a repository and keeps the rest", () => {
    const env: Record<string, string | undefined> = {
      GIT_DIR: "/repo/.git",
      GIT_WORK_TREE: "/repo",
      GIT_INDEX_FILE: "/repo/.git/index",
      GIT_COMMON_DIR: "/repo/.git",
      GIT_EDITOR: "true",
      PATH: "/bin",
    };
    scrubGitEnv(env);
    expect(env).toEqual({ GIT_EDITOR: "true", PATH: "/bin" });
  });

  it("has already run for this test process", () => {
    expect(process.env.GIT_DIR).toBeUndefined();
  });
});
