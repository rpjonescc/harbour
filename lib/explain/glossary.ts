import { DOCS_LINKS } from "@/lib/docs-links";

// The words Harbour can't avoid, each with one plain sentence. Fixed, reviewed text: no agent
// writes it. Codes (the area abbreviations, setting names) are not glossary words: they stay
// inside Technical details.

/** Every explained word. A string union, so a typo in `<Term id>` fails the type check. */
export type TermId =
  | "check"
  | "verdict"
  | "data-source"
  | "indexed"
  | "sitemap"
  | "search-console"
  | "outside-view"
  | "cited"
  | "links-to-you"
  | "worker"
  | "schedule"
  | "backup"
  | "second-brain"
  | "agent"
  | "run"
  | "pull-request"
  | "board-column"
  | "stuck"
  | "draft"
  | "voice-profile"
  | "pillar"
  | "budget"
  | "paid-data";

export type GlossaryEntry = {
  word: string;
  meaning: string;
  more?: { href: string; label: string };
};

export const GLOSSARY: Readonly<Record<TermId, GlossaryEntry>> = {
  check: {
    word: "Check",
    meaning:
      "Harbour visits your site, reads its pages and asks its data sources how it is doing, then sums it up in plain words.",
    more: { href: DOCS_LINKS.scores, label: "How checks and scores work" },
  },
  verdict: {
    word: "Verdict",
    meaning:
      "One word for how an area is doing, from Strong down to Needs work, worked out from the scores behind it.",
    more: { href: DOCS_LINKS.scores, label: "How scores work" },
  },
  "data-source": {
    word: "Data source",
    meaning:
      "A place Harbour asks for facts about your site, such as Google or a speed test, so it does not have to guess.",
  },
  indexed: {
    word: "In Google",
    meaning:
      "Google has stored the page and can show it in search results; a page that is not in Google cannot be found there.",
  },
  sitemap: {
    word: "Sitemap",
    meaning: "A list of your pages, kept on your site, that tells search engines what to read.",
  },
  "search-console": {
    word: "Search Console",
    meaning:
      "Google's free tool that shows which of your pages are in Google and what people searched to find them.",
    more: { href: DOCS_LINKS.searchConsole, label: "How to connect it" },
  },
  "outside-view": {
    word: "Outside view",
    meaning:
      "What the rest of the web says about you: which sites link to you and whether AI assistants name you.",
  },
  cited: {
    word: "Named by AI",
    meaning:
      "An AI assistant such as ChatGPT mentioned you or linked to you when it answered a question your customers ask.",
  },
  "links-to-you": {
    word: "Links to you",
    meaning:
      "Other sites that link to yours, which search engines and AI assistants read as a sign they can trust you.",
  },
  worker: {
    word: "Worker",
    meaning:
      "The part of Harbour that does the work in the background, such as checks, backups and agent runs, while you are away.",
  },
  schedule: {
    word: "Schedule",
    meaning:
      "A job Harbour does by itself at a set time, such as the daily check or the weekly report.",
    more: { href: DOCS_LINKS.schedule, label: "When things run" },
  },
  backup: {
    word: "Backup",
    meaning:
      "A copy of Harbour's data saved every night, so nothing is lost if this computer fails.",
    more: { href: DOCS_LINKS.backups, label: "Backups and restore" },
  },
  "second-brain": {
    word: "Second Brain",
    meaning:
      "Your private folder of notes that Harbour and Claude read and write, kept in its own safe place.",
  },
  agent: {
    word: "Agent",
    meaning:
      "Claude doing one job for Harbour by itself, such as writing the weekly report, and only ever suggesting changes.",
  },
  run: {
    word: "Run",
    meaning: "One go at a job, from start to finish, with a record of what happened.",
  },
  "pull-request": {
    word: "Pull request",
    meaning: "A proposed change to a site's code, waiting for your OK before it goes live.",
  },
  "board-column": {
    word: "Board column",
    meaning:
      "One stage on the Actions board, such as To do or Done, so you can see where each piece of work stands.",
  },
  stuck: {
    word: "Stuck",
    meaning: "Work that has not moved for a while, so it may need a nudge or a decision from you.",
  },
  draft: {
    word: "Draft",
    meaning:
      "A piece of writing that is ready for you to read, change and post; nothing posts by itself.",
  },
  "voice-profile": {
    word: "Voice profile",
    meaning:
      "A short guide to how a product sounds, so drafts written for it read like the product and not like a robot.",
  },
  pillar: {
    word: "Content pillar",
    meaning: "One of the few big topics a product writes about again and again.",
  },
  budget: {
    word: "Budget",
    meaning:
      "The most Harbour may spend on paid data each month; once it is reached, paid data waits.",
    more: { href: DOCS_LINKS.costs, label: "Costs and budget" },
  },
  "paid-data": {
    word: "Paid data",
    meaning:
      "Facts Harbour buys from an outside service, such as the sites that link to you, which count against the budget.",
    more: { href: DOCS_LINKS.costs, label: "Costs and budget" },
  },
};

/** The glossary entries for `ids`, in order, each once. */
export function termsFor(ids: readonly TermId[]): GlossaryEntry[] {
  return [...new Set(ids)].map((id) => GLOSSARY[id]);
}
