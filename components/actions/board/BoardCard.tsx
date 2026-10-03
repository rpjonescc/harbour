import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { ProductDot } from "@/components/ui/ProductDot";
import { Tag } from "@/components/ui/Tag";
import type { BoardColumnId } from "@/lib/actions/board-column";
import { WHO_PHRASE } from "@/lib/explain/actions";
import { BOARD_TEXT, COLUMN_COPY } from "@/lib/explain/board";
import { ActionStatusControls } from "../ActionStatusControls";
import { cardTitleId, columnHeadingId } from "../focus-after-change";
import { PullRequestLink } from "../PullRequestLink";
import type { BoardCardView } from "./card-view";
import { MoveMenu } from "./MoveMenu";
import type { CardDragProps } from "./useBoardDrag";

/**
 * One card on the board, in plain words: what it is, why it matters, the project, who is on it,
 * what it waits on and what happens next, the last move and its pull request. Text fields are
 * rendered as plain text: agent-written titles and reasons are untrusted.
 */
export function BoardCard({
  card,
  column,
  arrived,
  drag,
  onMove,
  today,
  demo,
}: {
  card: BoardCardView;
  /** Where the card sits now, which may be ahead of the server during a move. */
  column: BoardColumnId;
  /** Just moved here: eases in. */
  arrived: boolean;
  drag: CardDragProps;
  onMove: (to: BoardColumnId) => void;
  today: string;
  demo: boolean;
}) {
  const copy = COLUMN_COPY[column];
  const headingId = cardTitleId(card.id);
  const state = { ...card, stuck: card.stuck && column === card.column };
  return (
    <article
      aria-labelledby={headingId}
      data-action-id={card.id}
      data-group-heading={columnHeadingId(column)}
      className={`flex cursor-grab flex-col gap-2 rounded-md border border-line bg-surface p-3 active:cursor-grabbing ${arrived ? "board-arrive" : ""}`}
      {...drag}
    >
      {(card.isNewIdea || state.stuck) && (
        <div className="flex flex-wrap gap-1.5">
          {card.isNewIdea && <Tag tone="accent">{BOARD_TEXT.newIdea}</Tag>}
          {state.stuck && <Tag tone="warn">{BOARD_TEXT.stuck}</Tag>}
        </div>
      )}
      <h3 id={headingId} tabIndex={-1} className="font-medium text-ink">
        {card.title}
      </h3>
      {card.whyLine && <p className="text-sm text-ink-muted">{card.whyLine}</p>}
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        <ProductDot product={card} />
        <span>{card.productName}</span>
        {card.who && !card.isNewIdea && <span>· {WHO_PHRASE[card.who]}</span>}
      </p>
      <p className="text-sm text-ink">{copy.waitingOn(state)}</p>
      <p className="text-sm text-ink-muted">{copy.whatNext(state)}</p>
      {card.lastMoveText && <p className="text-xs text-ink-muted">{card.lastMoveText}</p>}
      <PullRequestLink url={card.prUrl} />
      {card.isNewIdea && (
        <ActionStatusControls
          id={card.id}
          title={card.title}
          status={card.status}
          today={today}
          demo={demo}
        />
      )}
      <MoveMenu title={card.title} current={column} onMove={onMove} />
      <TechnicalDetails id="board-card" topic={card.title}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-ink-muted">
          <dt>{BOARD_TEXT.technical.id}</dt>
          <dd>{card.id}</dd>
          <dt>{BOARD_TEXT.technical.status}</dt>
          <dd>{card.status}</dd>
          <dt>{BOARD_TEXT.technical.column}</dt>
          <dd>{column}</dd>
        </dl>
      </TechnicalDetails>
    </article>
  );
}
