const README = "https://github.com/rpjonescc/harbour#";

/** README sections the UI points to for setup steps (public docs; no secrets). */
export const DOCS_LINKS = {
  searchConsole: `${README}connect-search-console`,
  pagespeed: `${README}connect-pagespeed`,
  scores: `${README}how-scores-work`,
  schedule: `${README}when-things-run`,
  costs: `${README}costs-and-budget`,
  backups: `${README}backups-and-restore`,
  configuration: `${README}configuration`,
} as const;
