import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { ProductDot } from "@/components/ui/ProductDot";
import { Tag } from "@/components/ui/Tag";
import type { BoardColumnId } from "@/lib/actions/board-column";
import { BOARD_TEXT, COLUMN_COPY } from "@/lib/explain/board";
import { ActionStatusControls } from "../ActionStatusControls";
import { cardTitleId, columnHeadingId } from "../focus-after-change";
import { PullRequestLink } from "../PullRequestLink";
import type { BoardCardView } from "./card-view";
import { MoveMenu } from "./MoveMenu";
import type { CardDragProps } from "./useBoardDrag";

/**
 * What a glance does not need: what happens next, the last move and the stored codes, behind one
 * small disclosure so every card stays short.
 */
function CardDetails({
  card,
  column,
  next,
}: {
  card: BoardCardView;
  column: BoardColumnId;
  next: string;
}) {
  return (
    <details className="min-w-0 flex-1 text-sm">
      <summary className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-sm text-ink-muted hover:text-ink">
        {BOARD_TEXT.details} <span className="sr-only">({card.title})</span>
      </summary>
      <div className="flex flex-col gap-2 pb-1">
        <p className="text-ink-muted">{next}</p>
        {card.lastMoveText && <p className="text-xs text-ink-muted">{card.lastMoveText}</p>}
        {/* Per card: a shared key would open every card's details, stored codes and all. */}
        <TechnicalDetails id={`board-card-${card.id}`} topic={card.title}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-ink-muted">
            <dt>{BOARD_TEXT.technical.id}</dt>
            <dd>{card.id}</dd>
            <dt>{BOARD_TEXT.technical.status}</dt>
            <dd>{card.status}</dd>
            <dt>{BOARD_TEXT.technical.column}</dt>
            <dd>{column}</dd>
          </dl>
        </TechnicalDetails>
      </div>
    </details>
  );
}

/**
 * One card on the board, short enough to scan: what it is, why it matters (two lines), the project
 * and one status line (who has it and what it waits on), its pull request, and a small Move to…
 * button. What happens next and the last move sit behind Details. Text fields are
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
      className={`group/card flex cursor-grab flex-col gap-2 rounded-md border border-line bg-surface p-3 active:cursor-grabbing data-dragging:opacity-60 ${arrived ? "board-arrive" : ""}`}
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
      {/* Two lines at most; opening Details shows the whole reason. */}
      {card.whyLine && (
        <p className="line-clamp-2 text-sm text-ink-muted group-has-[details[open]]/card:line-clamp-none">
          {card.whyLine}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
        <ProductDot product={card} />
        <span className="text-ink-muted">{card.productName} ·</span>
        <span className="text-ink">{copy.waitingOn(state)}</span>
      </p>
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
      <div className="flex items-start justify-between gap-2">
        <CardDetails card={card} column={column} next={copy.whatNext(state)} />
        <MoveMenu title={card.title} current={column} isNewIdea={card.isNewIdea} onMove={onMove} />
      </div>
    </article>
  );
}
