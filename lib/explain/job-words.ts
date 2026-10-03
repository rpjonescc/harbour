// A job in plain words for the tower ("checked a draft for AI-sounding writing: “…”"), never its
// kind or the Agents page's label ("Check (humanizer): …"): those stay under Technical details.

import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import type { Named } from "@/lib/agents/view";
import type { Job } from "@/lib/jobs/queue";

/** What a job did and what it is doing, each starting lowercase so it can sit inside a sentence. */
export type JobWords = { done: string; doing: string };

/** "acme-docs-20261002-five-minutes" becomes "five minutes". */
export function ideaWords(ideaId: string | undefined): string {
  return (ideaId ?? "").replace(/^[a-z0-9-]+?-\d{8}-/, "").replaceAll("-", " ");
}

const words = (done: string, doing: string): JobWords => ({ done, doing });

/** A content piece by its idea's words, in quotes; "a draft" when the job names none. */
const piece = (id: string | undefined): string => {
  const text = ideaWords(id).trim();
  return text === "" ? "a draft" : `“${text}”`;
};

/** Topic titles that are codes or file names ("Local SEO", "llms.txt and …") stay off the tower. */
const CODED_TITLE = /\b(SEO|GEO|AEO)\b|\.txt\b/;

/** "the research note “Glossary”", or just "a research note" when its title is a code. */
function researchNote(topicId: string | undefined): string {
  const title = RESEARCH_TOPICS.find((t) => t.id === topicId)?.title;
  return title === undefined || CODED_TITLE.test(title)
    ? "a research note"
    : `the research note “${title}”`;
}

const productName = (id: string | undefined, products: readonly Named[]): string =>
  products.find((p) => p.id === id)?.name ?? "a product";

function gateWords(gate: string | undefined, title: string): JobWords {
  if (gate === "no-ai-slop") {
    return words(
      `checked ${title} for AI-sounding writing`,
      `checking ${title} for AI-sounding writing`,
    );
  }
  if (gate === "humanizer") {
    return words(`checked ${title} sounds like you`, `checking ${title} sounds like you`);
  }
  if (gate === "facts") {
    return words(`checked the facts in ${title}`, `checking the facts in ${title}`);
  }
  return words(`checked ${title}`, `checking ${title}`);
}

function contentWords(job: Pick<Job, "kind" | "params">, products: readonly Named[]): JobWords {
  const { params } = job;
  const title = piece(params.ideaId);
  switch (job.kind) {
    case "content-digest":
      return words("summed up the day's activity", "summing up the day's activity");
    case "content-ideas": {
      const name = productName(params.productId, products);
      return words(`found content ideas for ${name}`, `finding content ideas for ${name}`);
    }
    case "content-draft":
      return words(`wrote ${title}`, `writing ${title}`);
    case "content-atomise":
      return words(`turned ${title} into posts`, `turning ${title} into posts`);
    case "content-gate":
      return gateWords(params.gate, title);
    case "content-decision":
      return words("saved your decision", "saving your decision");
    default: {
      const post = piece(params.pieceId?.split(".")[0]);
      return words(`put ${post} in Postiz as a draft`, `putting ${post} in Postiz as a draft`);
    }
  }
}

/** A job in plain words: "checked Acme Docs" / "checking Acme Docs". */
export function jobWords(job: Pick<Job, "kind" | "params">, products: readonly Named[]): JobWords {
  const { params } = job;
  if (job.kind.startsWith("content-")) return contentWords(job, products);
  switch (job.kind) {
    case "research": {
      const note = researchNote(params.topic);
      return params.mode === "refresh"
        ? words(`updated ${note}`, `updating ${note}`)
        : words(`wrote ${note}`, `writing ${note}`);
    }
    case "scan": {
      const name = productName(params.productId, products);
      return words(`checked ${name}`, `checking ${name}`);
    }
    case "outside-check": {
      const name = productName(params.productId, products);
      return words(`checked how the web sees ${name}`, `checking how the web sees ${name}`);
    }
    case "discovery": {
      const name = productName(params.productId, products);
      return words(`found ideas for ${name}`, `finding ideas for ${name}`);
    }
    case "weekly-analyst":
      return words("wrote the weekly report", "writing the weekly report");
    case "daily-note":
      return words("wrote the daily note", "writing the daily note");
    case "backup":
      return words("backed up Harbour", "backing up Harbour");
    case "retention":
      return words("tidied old data", "tidying old data");
    case "notes-sync":
      return words("saved the notes to GitHub", "saving the notes to GitHub");
    default:
      return words("saved the Second Brain to GitHub", "saving the Second Brain to GitHub");
  }
}

/** "checked Acme Docs" becomes "Checked Acme Docs". */
export const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
