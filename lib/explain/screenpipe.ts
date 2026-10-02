import { RESTART_WORKER } from "./sources";

/** What Screenpipe does for Harbour, in one line. */
export const SCREENPIPE_PURPOSE =
  "Lets Harbour read a short, filtered summary of your day's work on this computer, to suggest content ideas.";

/** The setting name appears only here, inside setup steps. */
export const SCREENPIPE_CONNECT_STEPS: readonly string[] = [
  "On the Harbour computer, run: screenpipe auth token",
  "Add the token it prints to .env as HARBOUR_SCREENPIPE_API_KEY.",
  RESTART_WORKER,
];
