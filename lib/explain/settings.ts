import type { BackupHealth } from "@/lib/ops/backup-status";
import { approvalsPhrase } from "./approvals";
import { CANT_OPEN_BACKUP_FOLDER } from "./backups";
import { count, type PageVerdict, sentences } from "./page-verdict";
import type { TermLine } from "./term-line";

/**
 * The Settings page's own words: one plain line per section, files named only for Technical
 * details.
 */
export const SETTINGS_INTRO = {
  line: [
    "What Harbour is set up to do: products, ",
    { term: "schedule", text: "schedules" },
    ", connections, ",
    { term: "budget", text: "budget" },
    " and ",
    { term: "backup", text: "backups" },
    ". To change something, use the steps under Technical details.",
  ] satisfies TermLine,
  files:
    "Settings live in two files on the Harbour computer: .env and harbour.config.json. Edit them, then restart Harbour.",
} as const;

export const SETTINGS_PURPOSE = {
  products: "The sites Harbour watches for you.",
  schedules: "What Harbour does by itself, and when.",
  connections: "The accounts and keys Harbour uses to learn more about your sites.",
  budget: "How much Harbour may spend each month on paid data.",
  backups: "Spare copies of Harbour's data, kept in case something goes wrong.",
  content: "Ideas and drafts from your recent work, never posted for you.",
  more: "Where to change sources, devices and research for each site.",
} as const;

/** Why a schedule shows Off when the setting alone doesn't say. */
export const NOTE_OFF_REASON = {
  quiet: "Off while the personality is quiet",
  schedule: "Off: the morning note schedule is switched off",
  token: "Off until Claude is connected",
} as const;

/** Why the activity digest row shows Off when its own switch is on. */
export const DIGEST_OFF_REASON = {
  schedule: "Off: the activity digest schedule is switched off",
  token: "Off until Claude is connected",
  screenpipe: "Off until Screenpipe is connected",
} as const;

/** Why the Monday content ideas row shows Off when its own switch is on. */
export const IDEAS_OFF_REASON = {
  schedule: "Off: the content ideas schedule is switched off",
  token: "Off until Claude is connected",
} as const;

/** The morning note also stops when the personality is quiet; shown only in Technical details. */
export const NOTE_ALSO_OFF = "(or HARBOUR_PERSONALITY=quiet)";

/** What the Settings verdict reads: a few facts from the settings view, never a value or path. */
export type SettingsFacts = {
  demo: boolean;
  backup: BackupHealth;
  claudeConnected: boolean;
  /** A key that is set but points at a file that isn't there (Search Console's key file). */
  brokenKeyFiles: readonly string[];
  budgetReached: boolean;
  /** Optional connections in use that aren't set up yet. */
  optionalMissing: number;
  /** Research targets waiting for the owner's OK, across products. */
  awaitingApproval: number;
};

/** The one thing missing or broken, most important first; null when everything is set up. */
function firstGap(f: SettingsFacts): PageVerdict | null {
  if (f.demo) {
    return {
      tone: "watch",
      text: "Harbour is showing the example products. Add your own sites to start watching them.",
    };
  }
  if (f.backup === "failed") return { tone: "act", text: "The last backup didn't finish." };
  if (f.backup === "unreadable") {
    return { tone: "act", text: `${CANT_OPEN_BACKUP_FOLDER}, so backups can't be checked.` };
  }
  if (f.backup === "stale")
    return { tone: "watch", text: "There is no backup from the last two days." };
  if (!f.claudeConnected) {
    return { tone: "watch", text: "Claude isn't connected yet, so agents and drafts can't run." };
  }
  const [file] = f.brokenKeyFiles;
  if (file !== undefined) return { tone: "watch", text: `The ${file} key file can't be found.` };
  if (f.budgetReached) {
    return { tone: "watch", text: "This month's budget is used up, so paid data waits." };
  }
  return null;
}

/** The Settings page's verdict: "Everything is set up." or the one thing missing. */
export function settingsVerdict(f: SettingsFacts): PageVerdict {
  const waiting =
    f.awaitingApproval > 0 ? `${approvalsPhrase(f.awaitingApproval)} (under More settings).` : null;
  const gap = firstGap(f);
  if (gap) return { tone: gap.tone, text: sentences(gap.text, waiting) };
  const optional =
    f.optionalMissing > 0
      ? `${count(f.optionalMissing, "optional connection")} ${f.optionalMissing === 1 ? "isn't" : "aren't"} set up.`
      : null;
  return { tone: "ok", text: sentences("Everything is set up.", waiting ?? optional) };
}
