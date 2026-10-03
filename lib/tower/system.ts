// The tower's eight system lights from the facts systemFacts read. Pure: no I/O, no clock.

import { DOCS_LINKS } from "@/lib/docs-links";
import { BACKUP_HEALTH_LABEL } from "@/lib/explain/backups";
import { sourceTrouble } from "@/lib/explain/sources";
import type { LightId, LightTone } from "@/lib/explain/tower";
import { agoPhrase } from "@/lib/explain/tower";
import {
  BACKUP_SENTENCE,
  CHECK_SENTENCE,
  SOURCES_SENTENCE,
  sincePhrase,
  WEBSITE_UP,
  WORKER_SENTENCE,
} from "@/lib/explain/tower-lights";
import type { BackupHealth } from "@/lib/ops/backup-status";
import { FRESHNESS_RULES, freshnessTone } from "./freshness";
import type { CheckFact, SystemFacts } from "./system-data";
import { agentsLight, scheduleLight, spendLight } from "./system-more";

export type Light = { id: LightId; tone: LightTone; sentence: string; href: string | null };
export type Lights = { lights: Light[]; worst: Light | null };
export type Words = { now: Date; timeZone: string; locale: string };
type Shaped = Omit<Light, "id" | "href">;

const HOUR = 60 * 60_000;

/** How much a tone needs the owner; only these can be the worst light. */
const WORST_RANK: Partial<Record<LightTone, number>> = { act: 3, watch: 2, unknown: 1 };
/** Within one light, which state speaks for it: the most pressing first. */
const PRESSING: readonly LightTone[] = ["act", "watch", "unknown", "ready", "busy", "ok", "off"];
export const pressing = (a: LightTone, b: LightTone) => PRESSING.indexOf(a) - PRESSING.indexOf(b);

function workerLight(facts: SystemFacts, now: Date): Shaped {
  const { lastSeen } = facts.worker;
  const tone = freshnessTone(lastSeen, now, FRESHNESS_RULES.workerBeat);
  if (tone === "ok") return { tone, sentence: WORKER_SENTENCE.ok };
  if (tone === "unknown" || lastSeen === null) return { tone, sentence: WORKER_SENTENCE.never };
  if (tone === "act") return { tone, sentence: WORKER_SENTENCE.stopped };
  const minutes = Math.floor((now.getTime() - lastSeen.getTime()) / 60_000);
  return { tone, sentence: WORKER_SENTENCE.late(minutes) };
}

function checkOf(check: CheckFact, only: boolean, words: Words): Shaped {
  const name = only ? null : check.productName;
  if (check.scanning) return { tone: "busy", sentence: CHECK_SENTENCE.running };
  if (check.failedAt !== null) {
    return { tone: "act", sentence: CHECK_SENTENCE.failed([check.productName], only) };
  }
  const at = check.scannedAt;
  const tone = freshnessTone(at, words.now, FRESHNESS_RULES.dailyCheck);
  if (at === null) return { tone, sentence: CHECK_SENTENCE.never(name) };
  const ago = agoPhrase(at, words.now, words.timeZone, words.locale);
  return {
    tone,
    sentence: tone === "ok" ? CHECK_SENTENCE.fresh(ago) : CHECK_SENTENCE.late(ago, name),
  };
}

function checksLight(facts: SystemFacts, words: Words): Shaped {
  const only = facts.checks.length === 1;
  if (facts.checks.length === 0) return { tone: "unknown", sentence: CHECK_SENTENCE.noSites };
  const failed = facts.checks.filter((c) => !c.scanning && c.failedAt !== null);
  if (failed.length > 1) {
    const names = failed.map((c) => c.productName);
    return { tone: "act", sentence: CHECK_SENTENCE.failed(names, only) };
  }
  // The oldest check speaks for "fine": the light is only as fresh as its stalest site.
  const byAge = [...facts.checks].sort(
    (a, b) => (a.scannedAt?.getTime() ?? 0) - (b.scannedAt?.getTime() ?? 0),
  );
  // A stable sort: among equal tones the oldest check still comes first.
  const [first] = byAge
    .map((c) => checkOf(c, only, words))
    .sort((a, b) => pressing(a.tone, b.tone));
  return first ?? { tone: "unknown", sentence: CHECK_SENTENCE.noSites };
}

const BACKUP_TONE: Readonly<Record<BackupHealth, LightTone>> = {
  ok: "ok",
  "none-yet": "watch",
  failed: "act",
  stale: "act",
  unreadable: "act",
  off: "off",
};

function backupsLight(facts: SystemFacts, words: Words): Shaped {
  const { health, latest, lastFailure } = facts.backup;
  if (health !== "ok" || latest === null) {
    // A failed backup the schedule still retries today is worth a look, not yet the owner's job.
    const retrying = health === "failed" && (lastFailure?.attemptsLeft ?? 0) > 0;
    return {
      tone: retrying ? "watch" : BACKUP_TONE[health],
      sentence: `${BACKUP_HEALTH_LABEL[health]}.`,
    };
  }
  const done = BACKUP_SENTENCE.done(
    agoPhrase(latest.modifiedAt, words.now, words.timeZone, words.locale),
  );
  // Git failed: whether notes are saved is unknown, never fine.
  if (facts.brain.syncFailed) {
    return { tone: "unknown", sentence: `${done} ${BACKUP_SENTENCE.notesUnknown}` };
  }
  const unsaved = facts.brain.sync?.unsaved;
  if (unsaved === undefined) return { tone: "ok", sentence: done };
  if (unsaved === 0) return { tone: "ok", sentence: `${done} ${BACKUP_SENTENCE.notesSaved}` };
  const saved = facts.notesSavedAt;
  if (saved !== null && words.now.getTime() - saved.getTime() <= HOUR) {
    return { tone: "ok", sentence: done };
  }
  return { tone: "watch", sentence: `${done} ${BACKUP_SENTENCE.notesWaiting(unsaved)}` };
}

function sourcesLight(facts: SystemFacts): Shaped {
  const trouble = sourceTrouble(facts.failures);
  if (trouble !== null) return { tone: "watch", sentence: `${trouble}.` };
  if (facts.checks.every((c) => c.scannedAt === null)) {
    return { tone: "unknown", sentence: SOURCES_SENTENCE.none };
  }
  return { tone: "ok", sentence: SOURCES_SENTENCE.ok };
}

const HREF: Readonly<Record<LightId, string | null>> = {
  website: null,
  worker: DOCS_LINKS.deployment,
  schedules: "/settings",
  checks: "/settings/sources",
  backups: "/settings#backups",
  sources: "/settings/sources",
  agents: "/agents",
  spend: "/settings",
};

/** The lights in their fixed order, and the one that needs the owner most (act, watch, unknown). */
export function systemLights(
  facts: SystemFacts,
  now: Date,
  timeZone: string,
  locale: string,
): Lights {
  const words: Words = { now, timeZone, locale };
  const since = sincePhrase(facts.webStartedAt, now, timeZone, locale);
  const shaped: Record<LightId, Shaped> = {
    website: { tone: "ok", sentence: WEBSITE_UP(since) },
    worker: workerLight(facts, now),
    schedules: scheduleLight(facts.schedules, words),
    checks: checksLight(facts, words),
    backups: backupsLight(facts, words),
    sources: sourcesLight(facts),
    agents: agentsLight(facts.agents, facts.products),
    spend: spendLight(facts.cost, words),
  };
  const lights = (Object.keys(HREF) as LightId[]).map((id) => ({
    id,
    ...shaped[id],
    href: HREF[id],
  }));
  let worst: Light | null = null;
  for (const light of lights) {
    const rank = WORST_RANK[light.tone] ?? 0;
    if (rank > (worst ? (WORST_RANK[worst.tone] ?? 0) : 0)) worst = light;
  }
  return { lights, worst };
}
