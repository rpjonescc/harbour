import { makeBrain } from "@/tests/helpers/brain";
import { refreshPanelView } from "./refresh-view";

const NOW = new Date("2026-10-02T09:00:00Z"); // Friday 2 Oct, 19:00 in Sydney
const doc = (researched: string) => `---\nresearched: ${researched}\n---\n# Doc\n`;

describe("refreshPanelView", () => {
  let brain: ReturnType<typeof makeBrain>;
  beforeEach(() => {
    brain = makeBrain({
      "research/glossary.md": doc("2026-01-10"),
      "research/seo/local-seo.md": "# No date\n",
      "research/seo/seo-fundamentals.md": doc("2025-11-03"),
      "00-start-here.md": doc("2026-09-30"),
    });
  });
  afterEach(() => brain.cleanup());

  const settings = () => ({
    root: brain.root,
    timeZone: "Australia/Sydney",
    locale: "en-GB",
    enabled: true,
    tokenSet: true,
  });

  it("lists every due document oldest first, and counts the ones not written yet", () => {
    expect(refreshPanelView(settings(), NOW)).toEqual({
      schedule: "Next scheduled refresh: Sunday 4 Oct, 21:00",
      total: 10,
      due: [
        { title: "Local SEO", age: "date unknown" },
        { title: "SEO fundamentals", age: "researched 3 Nov 2025" },
        { title: "Glossary", age: "researched 10 Jan" },
      ],
      missing: 6,
      tokenSet: true,
    });
  });

  it("says when the schedule is off or has no token", () => {
    expect(refreshPanelView({ ...settings(), enabled: false }, NOW).schedule).toBe(
      "Scheduled refresh is off",
    );
    const noToken = refreshPanelView({ ...settings(), tokenSet: false }, NOW);
    expect(noToken).toMatchObject({
      schedule: "Scheduled refresh needs a Claude token",
      tokenSet: false,
    });
  });
});
