import { count, isAre, type PageVerdict, sentences } from "./page-verdict";

/** What the Actions verdict reads: the whole board's true totals. */
export type BoardVerdictFacts = {
  /** Every card in a column (Done only from the last 14 days). */
  cards: number;
  /** Cards that need the owner: new ideas, work in review, and work that is theirs. */
  needsYou: number;
  /** New ideas to accept or dismiss: part of `needsYou`. */
  newIdeas: number;
  stuck: number;
};

/** "2 cards are waiting for you.", or "2 new ideas …" when every one of them is a new idea. */
function waiting(f: BoardVerdictFacts): string {
  if (f.needsYou === 0) return "Nothing is waiting for you.";
  const what =
    f.newIdeas === f.needsYou ? count(f.newIdeas, "new idea") : count(f.needsYou, "card");
  return `${what} ${isAre(f.needsYou)} waiting for you.`;
}

/**
 * The Actions page's verdict: what waits for you, then what has stood still. New ideas alone are
 * good news (ready for you); other waiting work or a stuck card is worth a look.
 */
export function actionsVerdict(f: BoardVerdictFacts): PageVerdict {
  if (f.cards === 0) {
    return {
      tone: "unknown",
      text: "No cards are on the board yet. They appear after the next check.",
    };
  }
  const stuck =
    f.stuck > 0 &&
    `${count(f.stuck, "card")} ${f.stuck === 1 ? "has" : "have"} stood still too long.`;
  const onBoard =
    f.needsYou === 0 && !stuck && `${count(f.cards, "card")} ${isAre(f.cards)} on the board.`;
  const tone = f.stuck > 0 || f.needsYou > f.newIdeas ? "watch" : f.newIdeas > 0 ? "ready" : "ok";
  return { tone, text: sentences(waiting(f), stuck, onBoard) };
}
