/**
 * The Settings page's own words: one plain line per section, files named only for Technical
 * details.
 */
export const SETTINGS_INTRO = {
  line: "What Harbour is set up to do. To change something, use the steps under Technical details.",
  files:
    "Settings live in two files on the Harbour computer: .env and harbour.config.json. Edit them, then restart Harbour.",
} as const;

export const SETTINGS_PURPOSE = {
  products: "The sites Harbour watches for you.",
  schedules: "What Harbour does by itself, and when.",
  connections: "The accounts and keys Harbour uses to learn more about your sites.",
  budget: "How much Harbour may spend each month on paid data.",
  backups: "Spare copies of Harbour's data, kept in case something goes wrong.",
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

/** The morning note also stops when the personality is quiet; shown only in Technical details. */
export const NOTE_ALSO_OFF = "(or HARBOUR_PERSONALITY=quiet)";
