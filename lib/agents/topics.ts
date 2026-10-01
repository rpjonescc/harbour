export type ResearchTopic = {
  id: string;
  title: string;
  path: string;
  tags: string[];
  brief: string;
};

/** The research sprint: one job per topic, each writing exactly one document. */
export const RESEARCH_TOPICS: readonly ResearchTopic[] = [
  {
    id: "seo-fundamentals",
    title: "SEO fundamentals",
    path: "research/seo/seo-fundamentals.md",
    tags: ["seo"],
    brief:
      "How search engines crawl, index and rank pages; what matters most for a small product site; common myths.",
  },
  {
    id: "technical-seo-checklist",
    title: "Technical SEO checklist",
    path: "research/seo/technical-seo-checklist.md",
    tags: ["seo"],
    brief:
      "A practical checklist: indexability, sitemaps, robots.txt, canonicals, structured data, Core Web Vitals, internal links — with how to check each.",
  },
  {
    id: "local-seo",
    title: "Local SEO",
    path: "research/seo/local-seo.md",
    tags: ["seo"],
    brief:
      "Google Business Profile, local citations, reviews, 'near me' and suburb searches, local landing pages.",
  },
  {
    id: "how-ai-engines-pick-sources",
    title: "How AI engines select and cite sources",
    path: "research/geo/how-ai-engines-pick-sources.md",
    tags: ["geo"],
    brief:
      "How ChatGPT, Perplexity, Gemini and Claude choose and cite web sources; what evidence exists; what content gets cited (GEO).",
  },
  {
    id: "llms-txt-and-ai-crawlers",
    title: "llms.txt and AI crawler access",
    path: "research/geo/llms-txt-and-ai-crawlers.md",
    tags: ["geo"],
    brief:
      "The llms.txt proposal, AI crawler user agents (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended) and robots.txt choices.",
  },
  {
    id: "aeo-and-ai-overviews",
    title: "AEO, featured snippets and AI Overviews",
    path: "research/aeo/aeo-and-ai-overviews.md",
    tags: ["aeo"],
    brief:
      "Answer engine optimisation: featured snippets, People Also Ask, Google AI Overviews and AI Mode; content and schema that get quoted.",
  },
  {
    id: "google-preferred-sources",
    title: "Google Preferred Sources",
    path: "research/seo/google-preferred-sources.md",
    tags: ["seo", "aeo"],
    brief:
      "How Preferred Sources works, eligibility (domain/subdomain, fresh Top Stories-style content), the button/deeplink and placement, and realistic eligibility for each product.",
  },
  {
    id: "glossary",
    title: "Glossary",
    path: "research/glossary.md",
    tags: ["glossary"],
    brief:
      "Plain-English definitions of every SEO/GEO/AEO term a beginner will meet, linking to the other research documents with [[wiki-links]].",
  },
  {
    id: "start-here",
    title: "Start here",
    path: "00-start-here.md",
    tags: ["guide"],
    brief:
      "A beginner's guide to this Second Brain: what SEO, GEO and AEO are, the reading order of the research documents (as [[wiki-links]]), and the first five actions to take.",
  },
  {
    id: "scoring-rationale",
    title: "Scoring rationale",
    path: "research/scoring-rationale.md",
    tags: ["scoring"],
    brief:
      "Proposed sub-scores and weights for Harbour's SEO, GEO and AEO scores (0–100) with justification and known limitations.",
  },
];
