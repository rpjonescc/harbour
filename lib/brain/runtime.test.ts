import { makeBrain } from "@/tests/helpers/brain";
import { createBrainRuntime } from "./runtime";

vi.mock("server-only", () => ({}));

describe("createBrainRuntime", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("records an initial index failure and clears it after a successful reindex", async () => {
    const brain = makeBrain({ "okay.md": "# Okay" });
    let fail = true;
    const runtime = createBrainRuntime(brain.root, () => {
      if (fail) throw new Error("unreadable child");
    });
    try {
      expect(runtime.indexError).toContain("Reindex failed: unreadable child");
      expect(console.error).toHaveBeenCalled();
      fail = false;
      expect(runtime.reindex()).toBe(true);
      await vi.waitFor(() => expect(runtime.indexError).toBeNull());
    } finally {
      runtime.watcher?.close();
      brain.cleanup();
    }
  });

  it("keeps a watcher failure after a successful reindex", async () => {
    const brain = makeBrain({ "okay.md": "# Okay" });
    let fail = true;
    const runtime = createBrainRuntime(brain.root, () => {
      if (fail) throw new Error("unreadable child");
    });
    try {
      runtime.watcher?.emit("error", new Error("too many files"));
      expect(runtime.watchError).toContain("File watcher stopped: too many files");
      fail = false;
      runtime.reindex();
      await vi.waitFor(() => expect(runtime.indexError).toBeNull());
      expect(runtime.watchError).toContain("File watcher stopped: too many files");
    } finally {
      runtime.watcher?.close();
      brain.cleanup();
    }
  });
});
