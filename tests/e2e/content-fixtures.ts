// Synthetic content-machine data for the E2E run: what the fake Screenpipe serves, and what the
// fake agent CLI answers at each step. Fictional product, invented activity.
import { CHAIN_WORKS, PIECES } from "../helpers/content-fixtures";

/** On topic, with window titles (a snippet without one is dropped as unverifiable). */
export const E2E_SNIPPETS = [
  {
    text: "Acme Docs: reorganising the first steps so publishing comes before settings",
    app_name: "Editor",
    window_name: "guide.md",
  },
  {
    text: "Acme Docs: the sidebar clipped long page titles on narrow screens",
    app_name: "Editor",
    window_name: "sidebar.css",
  },
];

export const E2E_IDEA_TITLE = "Five minutes to a first deploy";

/** A finding the humanizer never lets go of, so one piece ends on Needs you. */
const STUCK = { pattern: "Colon reveal", quote: "Ship docs", fix: "State it plainly." };

/** Every step the E2E worker runs, keyed by the STEP line of its prompt. */
export const E2E_WORKS = {
  ...CHAIN_WORKS,
  digest: {
    themes: [
      {
        productId: "acme-docs",
        text: "Rewrote the getting-started guide around a short first deploy.",
        kind: "built",
      },
      {
        productId: "acme-docs",
        text: "Fixed the sidebar so long page titles wrap properly.",
        kind: "fixed",
      },
    ],
  },
  ideas: {
    ideas: [
      {
        title: E2E_IDEA_TITLE,
        pillar: null,
        angle: "Show the shortest path from sign-up to a live docs page.",
        audienceQuestion: "How long does it take to publish docs?",
        why: "You rebuilt the getting-started guide this week.",
        sources: ["product:acme-docs", "brain:products/acme-docs/notes.md"],
      },
    ],
  },
  // The X piece keeps a finding through both humanizer runs: it ends Needs you, the rest Ready.
  "gate:humanizer:1": {
    pieces: CHAIN_WORKS["gate:humanizer:1"].pieces.map((p) =>
      p.platform === "x" ? { ...p, findings: [STUCK] } : p,
    ),
  },
  "gate:humanizer:2": {
    pieces: [{ platform: "x", content: PIECES.x, findings: [STUCK], questions: [] }],
  },
};
