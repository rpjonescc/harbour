import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { makeBrain } from "@/tests/helpers/brain";
import { MAX_WORK_BYTES, parseWorkJson, type WorkPlan, workReview } from "./work-review";

const schema = z.strictObject({ title: z.string().min(1).max(20) });
const plan: WorkPlan<z.infer<typeof schema>> = {
  parse: (text) => parseWorkJson(text, schema),
  files: (value) => ({ "content/ideas/acme-docs/a.md": `# ${value.title}\n` }),
};
const WORK = "content/work/9.json";

function review(allowed = { prefixes: [] as string[], exact: [] as string[] }) {
  return { allowed, review: workReview({ jobId: 9, prompt: "PROMPT", plan, allowed }) };
}
const put = (root: string, text: string) => {
  mkdirSync(dirname(join(root, WORK)), { recursive: true });
  writeFileSync(join(root, WORK), text);
};

describe("parseWorkJson", () => {
  it.each([
    ["not JSON", "{ nope", /not valid JSON/],
    ["an unknown key", '{"title":"x","extra":1}', /not part of the format/],
    ["a long string", `{"title":"${"x".repeat(21)}"}`, /title/],
    ["an array", "[]", /not valid/],
    ["null", "null", /not valid/],
  ])("gives a plain reason for %s", (_label, text, reason) => {
    const parsed = parseWorkJson(text, schema);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.reason).toMatch(reason);
  });

  it("does not repeat the agent's own values in the reason", () => {
    const parsed = parseWorkJson('{"title":"x","SECRET-CANARY":1}', schema);
    expect(parsed.ok ? "" : parsed.reason).not.toContain("SECRET-CANARY");
  });

  it("strips a byte-order mark and returns the value", () => {
    expect(parseWorkJson('\uFEFF{"title":"x"}', schema)).toEqual({
      ok: true,
      value: { title: "x" },
    });
  });
});

describe("workReview", () => {
  it("rejects a missing, oversized or symlinked work file with a reason the agent can fix", () => {
    const { root, cleanup } = makeBrain({});
    try {
      const { review: r } = review();
      expect(r.check(root)).toMatch(/was not written/);
      put(root, "x".repeat(MAX_WORK_BYTES + 1));
      expect(r.check(root)).toMatch(/too large/);
      rmSync(join(root, WORK));
      writeFileSync(join(root, "real.json"), '{"title":"x"}');
      symlinkSync(join(root, "real.json"), join(root, WORK));
      expect(r.check(root)).toMatch(/too large or is not a regular file/);
    } finally {
      cleanup();
    }
  });

  it("publishes the planned files, extends the allowed set, removes the work file and returns its hash", () => {
    const { root, cleanup } = makeBrain({});
    try {
      put(root, '{"title":"Hello"}');
      const { allowed, review: r } = review();
      expect(r.check(root)).toBeNull();
      const digest = r.publish(root, () => {});
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
      expect(readFileSync(join(root, "content/ideas/acme-docs/a.md"), "utf8")).toBe("# Hello\n");
      expect(existsSync(join(root, WORK))).toBe(false);
      expect(allowed.exact).toEqual(["content/ideas/acme-docs/a.md"]);
    } finally {
      cleanup();
    }
  });

  it("refuses to publish what was not accepted, or what changed after it was", () => {
    const { root, cleanup } = makeBrain({});
    try {
      const { review: r } = review();
      expect(() => r.publish(root, () => {})).toThrow(/not been checked/);
      put(root, '{"title":"Hello"}');
      expect(r.check(root)).toBeNull();
      put(root, '{"title":"Changed"}');
      expect(() => r.publish(root, () => {})).toThrow(/changed after it was checked/);
    } finally {
      cleanup();
    }
  });

  it("forgets an accepted file when the next check rejects, so a stale value is never published", () => {
    const { root, cleanup } = makeBrain({});
    try {
      put(root, '{"title":"Hello"}');
      const { review: r } = review();
      expect(r.check(root)).toBeNull();
      put(root, "{ nope");
      expect(r.check(root)).toMatch(/not valid JSON/);
      expect(() => r.publish(root, () => {})).toThrow(/not been checked/);
    } finally {
      cleanup();
    }
  });

  it.each(["/etc/x.md", "../x.md", "content/../../x.md", "a//b.md", "", "a\\b.md"])(
    "refuses a planned path outside the brain (%j) before writing anything",
    (bad) => {
      const { root, cleanup } = makeBrain({});
      try {
        put(root, '{"title":"Hello"}');
        const allowed = { prefixes: [] as string[], exact: [] as string[] };
        const hostile: WorkPlan<{ title: string }> = {
          parse: plan.parse,
          files: () => ({ "content/ideas/acme-docs/a.md": "ok", [bad]: "x" }),
        };
        const r = workReview({ jobId: 9, prompt: "P", plan: hostile, allowed });
        expect(r.check(root)).toBeNull();
        expect(() => r.publish(root, () => {})).toThrow(/outside the brain/);
        expect(existsSync(join(root, "content/ideas/acme-docs/a.md"))).toBe(false);
        expect(allowed.exact).toEqual([]);
      } finally {
        cleanup();
      }
    },
  );

  it("never blocks on a FIFO and calls a directory not a regular file", () => {
    const { root, cleanup } = makeBrain({});
    try {
      const { review: r } = review();
      mkdirSync(join(root, "content/work"), { recursive: true });
      execFileSync("mkfifo", [join(root, WORK)]);
      expect(r.check(root)).toMatch(/not a regular file/);
      rmSync(join(root, WORK));
      mkdirSync(join(root, WORK));
      expect(r.check(root)).toMatch(/not a regular file/);
    } finally {
      cleanup();
    }
  });

  it("resets by removing the rejected file and builds the retry prompt from the shared helper", () => {
    const { root, cleanup } = makeBrain({});
    try {
      put(root, "{ nope");
      const { review: r } = review();
      expect(r.check(root)).toMatch(/not valid JSON/);
      r.reset(root);
      expect(existsSync(join(root, WORK))).toBe(false);
      expect(r.retryPrompt("Because.")).toContain("PROMPT");
      expect(r.retryPrompt("Because.")).toContain("Because.");
    } finally {
      cleanup();
    }
  });
});
