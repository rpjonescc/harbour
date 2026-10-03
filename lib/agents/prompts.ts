import { addDays, isIsoDay } from "@/lib/format/iso-day";
import type { Product } from "@/lib/products/catalog";
import type { ResearchTopic } from "./topics";

export const PROMPT_VERSION = "2b-v1";
export const REFRESH_PROMPT_VERSION = "5-v1";

/** Rules every agent prompt ends with. */
export const RULES = `Rules:
- Work only inside the current directory (the owner's private Second Brain).
- Do not create, edit or delete any other file than the target file(s) above. Changes elsewhere are discarded and fail the run.
- Use web search and web fetch to research. Prefer primary sources (official documentation, the platform's own announcements, peer-reviewed or large studies) over blogs.
- Cite every factual claim inline with a Markdown link to its source. Never invent sources, numbers or quotes; say what is uncertain.
- Write in plain English for a beginner. Explain jargon on first use.`;

/** Collapses whitespace so interpolated values cannot start new prompt lines. */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Throws unless `today` is a real date written YYYY-MM-DD. */
export function assertDate(today: string): void {
  if (!isIsoDay(today)) throw new Error(`Invalid date (expected YYYY-MM-DD): ${oneLine(today)}`);
}

/** One line per product: name, URL and the owner's notes to read. */
export function productContext(products: readonly Product[]): string {
  return products
    .map(
      (p) =>
        `- ${oneLine(p.name)} (${oneLine(p.url)}) — read products/${p.id}/notes.md first if it exists.`,
    )
    .join("\n");
}

/** The research document prompt; `extra` (the refresh instructions) goes just before the rules. */
function researchDocPrompt(
  topic: ResearchTopic,
  products: readonly Product[],
  today: string,
  extra: string,
): string {
  assertDate(today);
  return `TARGET_FILES: ${topic.path}

You are a careful research analyst writing one document for a small business owner's private knowledge base.

Topic: ${topic.title}
Scope: ${topic.brief}
Today's date: ${today}

Write the file ${topic.path} in Markdown, starting with this YAML frontmatter:
---
title: ${topic.title}
tags: [${topic.tags.join(", ")}]
researched: ${today}
confidence: medium
review_by: ${addDays(today, 90)}
sources: []
---

Set confidence to low, medium or high based on evidence quality. Replace sources with the list of
every http(s) URL you cite, as YAML strings. Keep the frontmatter valid YAML.

Structure: a short summary first, then sections with ## headings, then a section titled
"## What this means for our products" with specific, practical implications for each product:
${productContext(products)}

Link to related documents in this knowledge base with [[wiki-links]] using their file names
(for example [[glossary]] or [[how-ai-engines-pick-sources]]).

${extra}${RULES}`;
}

/** Prompt for one research-sprint document. */
export function researchPrompt(
  topic: ResearchTopic,
  products: readonly Product[],
  today: string,
): string {
  return researchDocPrompt(topic, products, today, "");
}

const REFRESH = `This document already exists. Read it first. Re-check its claims and sources against current information: keep what still holds, correct what changed, add what is new, and remove anything you can no longer support with a source. Set \`researched\` to today and \`review_by\` 90 days later. End with a section \`## What changed in this refresh\` listing the changes (or saying nothing material changed).

`;

/** Prompt for re-checking an existing research document (the monthly refresh). */
export function refreshPrompt(
  topic: ResearchTopic,
  products: readonly Product[],
  today: string,
): string {
  return researchDocPrompt(topic, products, today, REFRESH);
}

const PILLARS_SHAPE = `,
  "pillars": [{ "key": "lowercase-slug", "name": "short name", "description": "what this pillar covers", "why": "..." }]`;
const PILLARS_ASK = ` Also propose 3 to 5 content pillars: the recurring themes this product can write about for years (for example "getting started", "troubleshooting"). A pillar is a theme, not a post idea.`;

/** Prompt for one product's discovery: keywords, AI questions, competitors, and (`withPillars`, content on) content pillars. */
export function discoveryPrompt(product: Product, today: string, withPillars = false): string {
  assertDate(today);
  const dir = `products/${product.id}`;
  return `TARGET_FILES: ${dir}/discovery.md, ${dir}/proposals.json

You are an SEO and AI-visibility strategist doing discovery for one product.

Product: ${oneLine(product.name)} (${oneLine(product.url)})
Owner's notes: ${dir}/notes.md (read this first — audience, market, positioning).
Today's date: ${today}

Research the product's market: what people search for, which questions they ask AI assistants,
and which competitors rank or get cited. Then write two files:

1. ${dir}/discovery.md — Markdown with frontmatter (title, tags: [discovery], researched: ${today},
   sources: [...]) explaining your evidence and reasoning, with cited sources.

2. ${dir}/proposals.json — exactly this JSON shape and nothing else:
{
  "keywords": [{ "term": "...", "intent": "informational|commercial|transactional|navigational|local", "location": "optional, e.g. a suburb", "why": "..." }],
  "questions": [{ "text": "a natural question someone would ask an AI assistant", "why": "..." }],
  "competitors": [{ "name": "...", "url": "https://...", "why": "..." }]${withPillars ? PILLARS_SHAPE : ""}
}
Aim for about 30 keywords, about 12 questions and 3 to 5 competitors.${withPillars ? PILLARS_ASK : ""} Every "why" is one sentence.

${RULES}`;
}
