import { RESTART_WORKER } from "./sources";

/** What Claude does for Harbour, in one line. */
export const CLAUDE_PURPOSE =
  "Lets Claude write your research, ideas, the weekly report and the morning note.";

/** Shown at the top of the Agents page while Claude isn't connected. */
export const CLAUDE_OFF = "Claude isn't connected yet, so the Run buttons are switched off.";

/** The short reason on each disabled button's panel. */
export const CLAUDE_OFF_HERE = "Connect Claude first: the note at the top of this page says how.";

/** The setting name appears only here, inside setup steps. */
export const CLAUDE_CONNECT_STEPS: readonly string[] = [
  "On the Harbour computer, run: claude setup-token",
  "Add the token it prints to .env as HARBOUR_CLAUDE_OAUTH_TOKEN.",
  RESTART_WORKER,
];
