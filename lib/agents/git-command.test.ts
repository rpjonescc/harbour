import { makeGitBrain } from "@/tests/helpers/git-brain";
import { brainSyncStatus } from "./brain-status";
import { git } from "./git-command";

const calls = vi.hoisted(() => ({ envs: [] as (NodeJS.ProcessEnv | undefined)[] }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: ((file: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      if (file === "git" && args[0] === "--literal-pathspecs") calls.envs.push(options?.env);
      return actual.execFileSync(file, args, options);
    }) as typeof actual.execFileSync,
  };
});

afterEach(() => {
  calls.envs.length = 0;
});

describe("git", () => {
  it("never takes optional locks, pinned or not", () => {
    const brain = makeGitBrain({});
    try {
      git(brain.root, ["status", "--porcelain"]);
      git(brain.root, ["status", "--porcelain"], false);
      expect(calls.envs).toHaveLength(2);
      for (const env of calls.envs) expect(env?.GIT_OPTIONAL_LOCKS).toBe("0");
    } finally {
      brain.cleanup();
    }
  });

  it("is used, lock-free, by the sync status the web polls", () => {
    const brain = makeGitBrain({});
    try {
      brainSyncStatus(brain.root, `${brain.remote}-quarantine`);
      expect(calls.envs.length).toBeGreaterThan(0);
      for (const env of calls.envs) expect(env?.GIT_OPTIONAL_LOCKS).toBe("0");
    } finally {
      brain.cleanup();
    }
  });
});
