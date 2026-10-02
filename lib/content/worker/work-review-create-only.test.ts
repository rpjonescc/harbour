import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { makeBrain } from "@/tests/helpers/brain";
import { parseWorkJson, type WorkPlan, workReview } from "./work-review";

const schema = z.strictObject({ title: z.string().min(1).max(20) });
const TARGET = "content/ideas/acme-docs/a.md";
const SENTENCE = "A file is in the way, so nothing was saved.";
const plan: WorkPlan<z.infer<typeof schema>> = {
  parse: (text) => parseWorkJson(text, schema),
  files: (value) => ({ [TARGET]: `# ${value.title}\n` }),
  createOnly: { inTheWay: SENTENCE },
};

describe("workReview with createOnly", () => {
  it("fails with the fixed sentence, and leaves the file alone, when it appears after the check", () => {
    const { root, cleanup } = makeBrain({});
    try {
      mkdirSync(join(root, "content/work"), { recursive: true });
      writeFileSync(join(root, "content/work/9.json"), '{"title":"new"}');
      const allowed = { prefixes: [] as string[], exact: [] as string[] };
      const review = workReview({ jobId: 9, prompt: "P", plan, allowed });
      expect(review.check(root)).toBeNull();
      // The owner saves a file under that name between the check and the write.
      mkdirSync(dirname(join(root, TARGET)), { recursive: true });
      writeFileSync(join(root, TARGET), "owner text\n");
      expect(() => review.publish(root, () => {})).toThrow(SENTENCE);
      expect(readFileSync(join(root, TARGET), "utf8")).toBe("owner text\n");
    } finally {
      cleanup();
    }
  });

  it("writes a new file normally", () => {
    const { root, cleanup } = makeBrain({ "content/work/9.json": '{"title":"new"}' });
    try {
      const review = workReview({
        jobId: 9,
        prompt: "P",
        plan,
        allowed: { prefixes: [], exact: [] },
      });
      expect(review.check(root)).toBeNull();
      review.publish(root, () => {});
      expect(readFileSync(join(root, TARGET), "utf8")).toBe("# new\n");
    } finally {
      cleanup();
    }
  });
});
