import { makeBrain } from "@/tests/helpers/brain";
import { createBrainRuntime } from "./runtime";

vi.mock("server-only", () => ({}));

describe("createBrainRuntime", () => {
  it("records an initial index failure and clears it after a successful reindex", async () => {
    const brain = makeBrain({ "okay.md": "# Okay" });
    let fail = true;
    const runtime = createBrainRuntime(brain.root, () => {
      if (fail) throw new Error("unreadable child");
    });
    try {
      expect(runtime.error).toContain("Reindex failed: unreadable child");
      fail = false;
      expect(runtime.reindex()).toBe(true);
      await vi.waitFor(() => expect(runtime.error).toBeNull());
    } finally {
      runtime.watcher?.close();
      brain.cleanup();
    }
  });
});
