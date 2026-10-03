import type { SystemFacts } from "@/lib/tower/system-data";
import { ago, DAY, HOUR, LONDON, MIN, systemFacts, t0 } from "@/tests/helpers/tower";
import { type Light, systemLights } from "./system";

const shape = (over: Partial<SystemFacts> = {}) =>
  systemLights(systemFacts(over), t0, LONDON, "en-GB");
const light = (id: Light["id"], over: Partial<SystemFacts> = {}) => {
  const found = shape(over).lights.find((l) => l.id === id);
  if (!found) throw new Error(`no ${id} light`);
  return { tone: found.tone, sentence: found.sentence, href: found.href };
};
const check = (over: Partial<SystemFacts["checks"][number]>) => ({
  productId: "acme-docs",
  productName: "Acme Docs",
  scannedAt: ago(4 * HOUR),
  scanning: false,
  failedAt: null,
  ...over,
});

describe("systemLights", () => {
  it("always gives eight lights in the fixed order, all fine, and no worst", () => {
    const { lights, worst } = shape();
    expect(lights.map((l) => l.id)).toEqual([
      "website",
      "worker",
      "schedules",
      "checks",
      "backups",
      "sources",
      "agents",
      "spend",
    ]);
    expect(lights.every((l) => l.tone === "ok")).toBe(true);
    expect(worst).toBeNull();
  });

  it("says the website is up and since when", () => {
    expect(light("website")).toEqual({
      tone: "ok",
      sentence: "Harbour's website is up. Running since Wednesday.",
      href: null,
    });
    expect(light("website", { webStartedAt: ago(30 * MIN) }).sentence).toBe(
      "Harbour's website is up. Running since 09:30.",
    );
    expect(light("website", { webStartedAt: ago(20 * DAY) }).sentence).toBe(
      "Harbour's website is up. Running since 12 Sept.",
    );
  });
});

describe("the worker light", () => {
  const seen = (lastSeen: Date | null, runningJob = false) =>
    light("worker", { worker: { lastSeen, startedAt: null, runningJob } });

  it("is fine with a beat 90 s old and links to the deploy steps", () => {
    expect(seen(ago(90_000))).toEqual({
      tone: "ok",
      sentence: "The worker is running.",
      href: "https://github.com/rpjonescc/harbour#deployment",
    });
  });

  it("is worth a look at 3 min and needs the owner at 11 min", () => {
    expect(seen(ago(3 * MIN))).toMatchObject({
      tone: "watch",
      sentence: "The worker hasn't checked in for 3 minutes.",
    });
    expect(seen(ago(11 * MIN))).toMatchObject({
      tone: "act",
      sentence: "The worker isn't running, so checks, backups and agents are waiting.",
    });
  });

  it("can't tell when the worker has never beaten: a gap, never fine", () => {
    expect(seen(null)).toMatchObject({
      tone: "unknown",
      sentence:
        "Harbour hasn't heard from the worker yet. If you just started it, give it a minute.",
    });
  });
});

describe("the checks light", () => {
  it("says how long ago the oldest site was checked", () => {
    const checks = [check({ scannedAt: ago(2 * HOUR) }), check({ scannedAt: ago(3 * HOUR) })];
    expect(light("checks", { checks })).toEqual({
      tone: "ok",
      sentence: "Checked 3 h ago.",
      href: "/settings/sources",
    });
  });

  it("is busy while a check runs", () => {
    expect(light("checks", { checks: [check({ scanning: true }), check({})] })).toMatchObject({
      tone: "busy",
      sentence: "Checking your sites now.",
    });
  });

  it("needs the owner when a check failed, naming the site when there are several", () => {
    const failed = check({ productName: "Acme Blog", failedAt: ago(HOUR) });
    expect(light("checks", { checks: [check({}), failed] })).toMatchObject({
      tone: "act",
      sentence: "The last check for Acme Blog didn't finish.",
    });
    expect(light("checks", { checks: [failed] }).sentence).toBe("The last check didn't finish.");
    expect(light("checks", { checks: [failed, { ...failed, productName: "B" }] }).sentence).toBe(
      "The last check for 2 sites didn't finish.",
    );
  });

  it("is worth a look when late and needs the owner after 50 h", () => {
    expect(
      light("checks", {
        checks: [check({}), check({ productName: "Acme Blog", scannedAt: ago(30 * HOUR) })],
      }),
    ).toMatchObject({
      tone: "watch",
      sentence: "Acme Blog was last checked yesterday at 04:00.",
    });
    expect(light("checks", { checks: [check({ scannedAt: ago(3 * DAY) })] })).toMatchObject({
      tone: "act",
      sentence: "Last checked on 29 Sept.",
    });
  });

  it("can't tell before the first check, or with no sites", () => {
    expect(light("checks", { checks: [check({ scannedAt: null })] })).toMatchObject({
      tone: "unknown",
      sentence: "Not checked yet.",
    });
    expect(light("checks", { checks: [] })).toMatchObject({
      tone: "unknown",
      sentence: "There are no sites to check yet.",
    });
  });
});

describe("the backups light", () => {
  const backup = systemFacts().backup;

  it("says when it backed up and that notes are saved", () => {
    expect(light("backups")).toEqual({
      tone: "ok",
      sentence: "Backed up 6 h ago. Notes saved.",
      href: "/settings#backups",
    });
  });

  it("leaves notes out when Harbour can't count them", () => {
    const brain = { sync: null, syncFailed: false, recovery: { pending: null, lastError: null } };
    expect(light("backups", { brain }).sentence).toBe("Backed up 6 h ago.");
  });

  it("says it couldn't check the notes when git failed, never that all is fine", () => {
    const brain = { sync: null, syncFailed: true, recovery: { pending: [], lastError: null } };
    expect(light("backups", { brain })).toMatchObject({
      tone: "unknown",
      sentence: "Backed up 6 h ago. Couldn't check whether your notes are saved.",
    });
  });

  it("is worth a look when notes have waited over an hour, fine while they are recent", () => {
    const brain = {
      sync: { unsaved: 2, unpushed: 0 },
      syncFailed: false,
      recovery: { pending: [], lastError: null },
    };
    expect(light("backups", { brain, notesSavedAt: ago(30 * MIN) })).toMatchObject({
      tone: "ok",
      sentence: "Backed up 6 h ago.",
    });
    expect(light("backups", { brain, notesSavedAt: ago(2 * HOUR) })).toMatchObject({
      tone: "watch",
      sentence:
        "Backed up 6 h ago. 2 changes in your Second Brain haven't been saved for over an hour.",
    });
  });

  it("uses the existing backup health words for trouble", () => {
    expect(light("backups", { backup: { ...backup, health: "stale" } })).toMatchObject({
      tone: "act",
      sentence: "No recent backup.",
    });
    expect(light("backups", { backup: { ...backup, health: "off" } })).toMatchObject({
      tone: "off",
      sentence: "Nightly backups are off.",
    });
    expect(
      light("backups", { backup: { ...backup, latest: null, health: "none-yet" } }),
    ).toMatchObject({
      tone: "watch",
      sentence: "No backup yet.",
    });
  });

  it("is worth a look while the schedule still retries a failed backup, the owner's after", () => {
    const failure = { jobId: 9, at: ago(HOUR), error: "disk full", attemptsLeft: 1 };
    const failed = { ...backup, health: "failed" as const, lastFailure: failure };
    expect(light("backups", { backup: failed })).toMatchObject({
      tone: "watch",
      sentence: "Last backup didn't finish.",
    });
    const spent = { ...failed, lastFailure: { ...failure, attemptsLeft: 0 } };
    expect(light("backups", { backup: spent }).tone).toBe("act");
  });
});

describe("the sources light", () => {
  it("is fine when every source answered", () => {
    expect(light("sources")).toEqual({
      tone: "ok",
      sentence: "All data sources answered.",
      href: "/settings/sources",
    });
  });

  it("uses the existing source trouble sentence", () => {
    const failures = [{ productId: "acme-docs", collector: "pagespeed", error: "quota" }];
    expect(light("sources", { failures })).toMatchObject({
      tone: "watch",
      sentence: "Google speed test (PageSpeed) had a problem in the last check.",
    });
  });

  it("can't tell before any site has been checked", () => {
    expect(light("sources", { checks: [check({ scannedAt: null })] }).tone).toBe("unknown");
  });
});

describe("the worst light", () => {
  it("is an act light before a watch light before an unknown one, first in order on a tie", () => {
    const worker = { lastSeen: null, startedAt: null, runningJob: false };
    const failures = [{ productId: "acme-docs", collector: "pagespeed", error: null }];
    expect(shape({ worker }).worst?.id).toBe("worker");
    expect(shape({ worker, failures }).worst?.id).toBe("sources");
    const stale = { ...systemFacts().backup, health: "stale" as const };
    expect(shape({ worker, failures, backup: stale }).worst?.id).toBe("backups");
    const checks = [check({ failedAt: ago(HOUR) })];
    expect(shape({ backup: stale, checks }).worst?.id).toBe("checks");
  });

  it("is never a busy or switched-off light", () => {
    const backup = { ...systemFacts().backup, health: "off" as const };
    expect(shape({ backup, checks: [check({ scanning: true })] }).worst).toBeNull();
  });
});
