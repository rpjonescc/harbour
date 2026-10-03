import type { TermId } from "./glossary";

// "What's this page?" for every page: what it is for, how to read it, what to do first and the
// words it uses. Plain words only; the meanings come from the glossary.

export type PageId =
  | "tower"
  | "actions"
  | "product"
  | "content"
  | "agents"
  | "run"
  | "brain"
  | "settings"
  | "targets"
  | "sources"
  | "devices"
  | "design";

export type PageHelpCopy = {
  purpose: string;
  /** Top to bottom, at most 5 short lines. */
  howToRead: readonly string[];
  firstStep: string;
  terms: readonly TermId[];
};

export const PAGE_HELP: Readonly<Record<PageId, PageHelpCopy>> = {
  tower: {
    purpose:
      "Today shows where everything stands: whether Harbour is running, what needs you and how each product is doing.",
    howToRead: [
      "The top line sums it all up in one sentence.",
      "Systems: eight lights say whether each part of Harbour is fine.",
      "Needs you: at most five things waiting for your decision, each with one button.",
      "Your products: one card per product with its verdict, its trend and the next thing to do.",
      "What's happening and Wins: what ran today and what got better this week.",
    ],
    firstStep:
      "Start with the first item under Needs you; if that list is empty, nothing is waiting for you.",
    terms: [
      "worker",
      "schedule",
      "check",
      "backup",
      "data-source",
      "agent",
      "run",
      "verdict",
      "board-column",
      "stuck",
      "pull-request",
      "indexed",
      "cited",
      "links-to-you",
      "draft",
      "budget",
    ],
  },
  actions: {
    purpose:
      "Actions lists the things worth doing to get your products found more easily, and where each one stands.",
    howToRead: [
      "Each action says what is wrong, how to fix it and how Harbour will know it worked.",
      "The actions most worth doing come first.",
      "The filters at the top narrow the list to one product, area or stage.",
      "Each card says whether you, Claude or nobody is on it.",
    ],
    firstStep: "Open the first new action and decide what happens to it.",
    terms: ["board-column", "check", "pull-request"],
  },
  product: {
    purpose: "This page shows how one product is doing in three areas, and what to fix first.",
    howToRead: [
      "The summary and the three area cards give each area a verdict and its trend.",
      "What's behind each rating lists the parts weakest first, so the top one is the place to start.",
      "What to fix lists the actions for this product.",
      "Pages in Google, the outside view and Search Console show the facts behind the verdicts.",
      "Sources show which data sources answered at the last check.",
    ],
    firstStep: "Read the weakest area's card, then open its first action.",
    terms: [
      "verdict",
      "check",
      "indexed",
      "sitemap",
      "search-console",
      "outside-view",
      "cited",
      "links-to-you",
      "data-source",
    ],
  },
  content: {
    purpose:
      "Content holds post ideas and drafts written from your recent work; nothing is posted until you post it.",
    howToRead: [
      "The tabs sort ideas and drafts by where they stand, from Ready for you to Discarded.",
      "Needs you holds pieces that are waiting for a decision only you can make.",
      "Each draft can be copied, approved, edited or discarded.",
      "A voice profile keeps each product's drafts sounding like the product.",
    ],
    firstStep: "Open Ready for you and read the first draft.",
    terms: ["draft", "digest", "voice-profile", "pillar", "second-brain"],
  },
  agents: {
    purpose:
      "Agents is where Claude's background jobs start, and where you see what they did; one job runs at a time.",
    howToRead: [
      "The buttons at the top start a job now instead of waiting for its schedule.",
      "The weekly report and the research refresh panels show their latest results.",
      "Recent runs lists what Claude and Harbour ran lately, newest first.",
    ],
    firstStep: "Look at Recent runs: anything that didn't finish says why and what to do.",
    terms: ["agent", "run", "worker", "schedule", "second-brain"],
  },
  run: {
    purpose:
      "This page follows one run from start to finish: whether it worked, what it did and which notes it changed.",
    howToRead: [
      "The line at the top says whether the run is waiting, running, done or didn't finish.",
      "If it didn't finish, the line under it says what to do next.",
      "Technical details hold the step-by-step log.",
      "Files changed links to each note the run wrote.",
    ],
    firstStep: "Read the top line; if the run didn't finish, follow the step under it.",
    terms: ["run", "agent", "second-brain"],
  },
  brain: {
    purpose:
      "The Second Brain is your private folder of notes, which you and Claude both read and write.",
    howToRead: [
      "The list on the left is every folder and note; new notes are marked.",
      "Search finds a note by any word in it.",
      "Each note opens on the right as a page you can read.",
    ],
    firstStep: "Open the start-here note, or search for the topic you have in mind.",
    terms: ["second-brain", "agent"],
  },
  settings: {
    purpose:
      "Settings shows what Harbour is set up to do: products, schedules, keys, budget and backups.",
    howToRead: [
      "Each card shows one part of the set-up and whether it works.",
      "Schedules say when each job runs next.",
      "The budget card shows this month's spend on paid data.",
      "To change something, follow the steps under Technical details.",
    ],
    firstStep: "Look for a card that says something isn't working, and follow its steps.",
    terms: ["schedule", "backup", "budget", "paid-data", "worker", "research-target"],
  },
  targets: {
    purpose:
      "Research targets are the searches, questions, rivals and topics Harbour follows for one product; nothing is followed until you say OK.",
    howToRead: [
      "The line at the top says how many targets wait for your OK.",
      "Each section holds one kind of target, with its counts at the top.",
      "Approve, Reject or Edit each one; Approve all takes a whole section at once.",
    ],
    firstStep: "Read the first target waiting for your OK and decide.",
    terms: ["research-target", "agent", "pillar"],
  },
  sources: {
    purpose: "Sources shows where each score's data comes from, and whether it is working.",
    howToRead: [
      "The schedule card says when the next check runs.",
      "Connections show which data sources are set up.",
      "Each product's table shows how every data source answered at its last check.",
    ],
    firstStep: "Look for a data source that didn't answer, and follow its steps.",
    terms: ["data-source", "check", "schedule", "search-console", "paid-data"],
  },
  devices: {
    purpose: "Devices lists the phones and computers that can open Harbour.",
    howToRead: [
      "Each device signs in with a passkey: your fingerprint, face or screen lock.",
      "Add a device to sign in from a new phone or computer.",
    ],
    firstStep: "Remove any device you no longer use.",
    terms: ["passkey"],
  },
  design: {
    purpose: "The design page shows every part of Harbour's look, with made-up examples.",
    howToRead: [
      "Colour tokens and type come first.",
      "Each section below shows one kind of component in its main states.",
    ],
    firstStep: "Find the component you are changing and check it in light and dark.",
    terms: ["verdict", "check"],
  },
};
