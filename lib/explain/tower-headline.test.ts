import { HEADLINE_UNREAD, towerHeadline, towerHeadlineParts } from "./tower";

const worker = {
  id: "worker" as const,
  sentence: "The worker isn't running, so checks, backups and agents are waiting.",
};

describe("towerHeadlineParts", () => {
  it("splits the h1 into the lead and the sub-line the page announces", () => {
    expect(towerHeadlineParts({ worst: null, needsCount: 2 })).toEqual({
      lead: "Everything is running.",
      subline: "2 things need you.",
    });
    expect(towerHeadlineParts({ worst: worker, needsCount: 2 })).toEqual({
      lead: worker.sentence,
      subline: "1 more thing needs you.",
    });
  });

  it("joins back into the one-sentence headline", () => {
    const input = { worst: worker, needsCount: 3 };
    const { lead, subline } = towerHeadlineParts(input);
    expect(towerHeadline(input)).toBe(`${lead} ${subline}`);
  });

  it("never says everything is running while a light is worth a look", () => {
    expect(towerHeadlineParts({ worst: null, needsCount: 0, looks: 1 })).toEqual({
      lead: "Nothing is broken. 1 light is worth a look.",
      subline: "Nothing needs you right now.",
    });
    expect(towerHeadlineParts({ worst: null, needsCount: 1, looks: 2 }).lead).toBe(
      "Nothing is broken. 2 lights are worth a look.",
    );
  });

  it("lets a red light lead even when others are worth a look", () => {
    expect(towerHeadlineParts({ worst: worker, needsCount: 1, looks: 3 }).lead).toBe(
      worker.sentence,
    );
  });

  it("says plainly when the systems or Needs you could not be read", () => {
    expect(towerHeadlineParts({ worst: null, needsCount: 1, systemsRead: false })).toEqual({
      lead: HEADLINE_UNREAD.systems,
      subline: "1 thing needs you.",
    });
    expect(towerHeadlineParts({ worst: null, needsCount: null })).toEqual({
      lead: "Everything is running.",
      subline: HEADLINE_UNREAD.needs,
    });
    expect(towerHeadlineParts({ worst: worker, needsCount: null }).subline).toBe(
      HEADLINE_UNREAD.needs,
    );
  });
});
