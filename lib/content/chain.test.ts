import { type ChainPiece, chainNext, finalPiece, gateTargets } from "./chain";
import type { GateEntry } from "./schema";

const entry = (
  gate: GateEntry["gate"],
  result: GateEntry["result"],
  attempt: 1 | 2 = 1,
  over: Partial<GateEntry> = {},
): GateEntry => ({
  gate,
  order: 1,
  attempt,
  result,
  findings:
    result === "fail" ? [{ pattern: "Colon reveal", quote: "q", fix: "plain sentence" }] : [],
  questions: [],
  jobId: 1,
  at: "2026-10-02T00:00:00.000Z",
  textBefore: `sha256:${"a".repeat(64)}`,
  textAfter: `sha256:${"b".repeat(64)}`,
  ...over,
});
const piece = (
  platform: ChainPiece["platform"],
  entries: GateEntry[] = [],
  over: Partial<ChainPiece> = {},
): ChainPiece => ({ platform, state: "drafting", hasContent: true, entries, ...over });

describe("chainNext", () => {
  it("starts with no-ai-slop, then humanizer, then facts, one gate at a time", () => {
    expect(chainNext([piece("linkedin"), piece("x")])).toEqual({ gate: "no-ai-slop", attempt: 1 });
    const slop = [entry("no-ai-slop", "pass")];
    expect(chainNext([piece("linkedin", slop), piece("x", slop)])).toEqual({
      gate: "humanizer",
      attempt: 1,
    });
    const both = [...slop, entry("humanizer", "pass")];
    expect(chainNext([piece("linkedin", both)])).toEqual({ gate: "facts", attempt: 1 });
  });

  it("asks for one revision when a piece failed, and moves on after it whatever it returned", () => {
    const failed = [entry("no-ai-slop", "fail")];
    expect(
      chainNext([piece("linkedin", failed), piece("x", [entry("no-ai-slop", "pass")])]),
    ).toEqual({ gate: "no-ai-slop", attempt: 2 });
    const revised = [...failed, entry("no-ai-slop", "fail", 2)];
    expect(chainNext([piece("linkedin", revised)])).toEqual({ gate: "humanizer", attempt: 1 });
  });

  it("treats a facts or platform failure as a facts-stage revision, and is done when both passed", () => {
    const upTo = [entry("no-ai-slop", "pass"), entry("humanizer", "pass")];
    expect(
      chainNext([piece("x", [...upTo, entry("facts", "pass"), entry("platform", "fail")])]),
    ).toEqual({ gate: "facts", attempt: 2 });
    expect(
      chainNext([piece("x", [...upTo, entry("facts", "pass"), entry("platform", "pass")])]),
    ).toBeNull();
  });

  it("ignores stubs, approved and discarded pieces, and is done when none is live", () => {
    expect(
      chainNext([piece("x", [], { hasContent: false }), piece("blog", [], { state: "approved" })]),
    ).toBeNull();
  });
});

describe("gateTargets", () => {
  it("is every live piece at attempt 1, and only the pieces that failed at attempt 2", () => {
    const pieces = [
      piece("linkedin", [entry("humanizer", "fail")]),
      piece("x", [entry("humanizer", "pass")]),
    ];
    expect(gateTargets(pieces, { gate: "humanizer", attempt: 1 }).map((p) => p.platform)).toEqual([
      "linkedin",
      "x",
    ]);
    expect(gateTargets(pieces, { gate: "humanizer", attempt: 2 }).map((p) => p.platform)).toEqual([
      "linkedin",
    ]);
  });
});

describe("finalPiece", () => {
  const passing = ["no-ai-slop", "humanizer", "facts", "platform"].map((g) =>
    entry(g as GateEntry["gate"], "pass"),
  );
  it("is ready when every gate passed and nothing is asked", () => {
    expect(finalPiece(passing, [])).toMatchObject({
      state: "ready",
      needsYou: null,
      gates: { slop: "pass", humanizer: "pass", facts: "pass", platform: "pass" },
    });
  });

  it("is Needs you, with one plain sentence, for a failure, an error, a question or a missing gate", () => {
    const failed = [...passing.slice(0, 1), entry("humanizer", "fail", 1), ...passing.slice(2)];
    expect(finalPiece(failed, [])).toMatchObject({
      state: "needs-you",
      needsYou: "The humanizer check still found 1 pattern. Edit the piece, or discard it.",
    });
    const error = [...passing.slice(0, 3), entry("platform", "error")];
    expect(finalPiece(error, []).needsYou).toBe("The platform check didn't finish. Try again.");
    expect(
      finalPiece(
        [
          ...passing.slice(0, 3),
          entry("platform", "pass", 1, { questions: ["Is the free plan still 3 projects?"] }),
        ],
        [],
      ).needsYou,
    ).toBe("A question for you: Is the free plan still 3 projects?");
    expect(finalPiece(passing, ["Which date?"]).needsYou).toBe("A question for you: Which date?");
    expect(finalPiece(passing.slice(0, 3), []).state).toBe("needs-you");
  });

  it("calls attempt 2 passes revised", () => {
    const revised = [
      entry("no-ai-slop", "fail"),
      entry("no-ai-slop", "revised", 2),
      ...passing.slice(1),
    ];
    expect(finalPiece(revised, []).gates.slop).toBe("revised");
  });
});

describe("fail closed", () => {
  it("never reads an unknown gate or attempt as every piece", () => {
    const pieces = [piece("linkedin")];
    expect(() => gateTargets(pieces, { gate: "platform", attempt: 1 } as never)).toThrow();
    expect(() => gateTargets(pieces, { gate: "humanizer", attempt: 3 } as never)).toThrow();
  });

  it("revises a piece whose first run errored, once", () => {
    const errored = [entry("no-ai-slop", "error")];
    expect(chainNext([piece("x", errored)])).toEqual({ gate: "no-ai-slop", attempt: 2 });
    expect(chainNext([piece("x", [...errored, entry("no-ai-slop", "error", 2)])])).toEqual({
      gate: "humanizer",
      attempt: 1,
    });
  });
});
