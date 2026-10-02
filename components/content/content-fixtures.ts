import type { ContentView, IdeaView, PieceView } from "@/lib/content/read/view-types";

/** Fictional builders for the component tests and /design (Acme Docs is not a real product). */
export const piece = (over: Partial<PieceView> = {}): PieceView => ({
  id: "acme-docs-20261002-five-minutes.linkedin",
  platform: "linkedin",
  platformName: "LinkedIn",
  tab: "ready",
  title: "Five minutes to a first deploy (LinkedIn)",
  text: "Docs that ship in five minutes.\n\n#docs",
  copy: [{ label: "Whole piece", text: "Docs that ship in five minutes.\n\n#docs" }],
  editText: "Docs that ship in five minutes.",
  empty: false,
  needsYou: null,
  retry: false,
  flags: [],
  flagLines: [],
  revision: 2,
  edited: false,
  state: "ready",
  saving: false,
  gates: [],
  claims: [],
  file: "content/pieces/acme-docs-20261002-five-minutes/linkedin.md",
  ...over,
});

export const idea = (over: Partial<IdeaView> = {}): IdeaView => ({
  id: "acme-docs-20261002-five-minutes",
  productId: "acme-docs",
  productName: "Acme Docs",
  title: "Five minutes to a first deploy",
  why: "You rebuilt this guide this week.",
  pillar: "getting-started",
  angle: "Show the shortest path from sign-up to a live page.",
  audienceQuestion: "How long does it take to publish docs?",
  sources: ["digest:2026-10-01#t1"],
  created: "2026-10-02",
  tab: "ideas",
  note: null,
  retry: false,
  saving: false,
  pieces: [],
  rollup: "",
  ...over,
});

export const view = (over: Partial<ContentView> = {}): ContentView => ({
  tabs: [
    { id: "ready", label: "Ready for you", count: 1 },
    { id: "needs-you", label: "Needs you", count: 0 },
    { id: "ideas", label: "Ideas", count: 1 },
    { id: "writing", label: "Being written", count: 0 },
    { id: "approved", label: "Approved", count: 0 },
    { id: "discarded", label: "Discarded", count: 0 },
  ],
  defaultTab: "ready",
  ideas: [
    idea({ tab: null, pieces: [piece()], rollup: "1 ready" }),
    idea({ id: "acme-docs-20261002-two", title: "Two steps people miss" }),
  ],
  voice: [{ productId: "acme-docs", name: "Acme Docs", state: "ok" }],
  digest: { gap: false },
  unreadable: [],
  capped: false,
  tokenSet: true,
  ...over,
});
