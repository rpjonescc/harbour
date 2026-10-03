import { lastStatusActor } from "./status-actor";

const created = { actor: "scan", from: null, to: "open" } as const;
const started = (actor: "owner" | "claude") =>
  ({ actor, from: "open", to: "in_progress" }) as const;
const prLink = { actor: "claude", from: "in_progress", to: "in_progress" } as const;

describe("lastStatusActor", () => {
  it("is who made the latest event that changed the status", () => {
    expect(lastStatusActor([created, started("claude")])).toBe("claude");
    expect(lastStatusActor([created, started("owner"), prLink])).toBe("owner");
  });
  // A board move between two columns of one status (Backlog to Queue) changes only the stage.
  it("counts a board move that changes only the stage", () => {
    const toQueue = {
      actor: "claude",
      from: "open",
      to: "open",
      fromStage: null,
      toStage: "queue",
    } as const;
    expect(lastStatusActor([created, toQueue])).toBe("claude");
    expect(lastStatusActor([created, toQueue, { ...prLink, fromStage: null, toStage: null }])).toBe(
      "claude",
    );
  });
  it("counts creation", () => {
    expect(lastStatusActor([created])).toBe("scan");
  });
  // Pruning can leave only PR-link events: unknown, never Claude by default.
  it("is null when pruning left no status change", () => {
    expect(lastStatusActor([prLink, prLink])).toBeNull();
    expect(lastStatusActor([])).toBeNull();
  });
});
