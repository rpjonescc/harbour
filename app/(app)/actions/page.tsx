import { ActionBoard } from "@/components/actions/ActionBoard";
import { ActionFilters } from "@/components/actions/ActionFilters";
import { ApprovalsNote } from "@/components/actions/ApprovalsNote";
import { Board, FocusNotice, ViewSwitch } from "@/components/actions/board";
import { SyncFailureNote } from "@/components/actions/SyncFailureNote";
import { approvalsWaiting, syncFailures } from "@/lib/actions/board-notices";
import { loadBoard, parseActionsView, parseBoardFocus } from "@/lib/actions/board-view";
import { actionCounts, boardActions, parseActionFilter } from "@/lib/actions/views";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { boardSummary } from "@/lib/explain/actions";
import { isoDateIn } from "@/lib/format/date";
import { getProducts } from "@/lib/products/catalog";

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  const db = getDb();
  const products = getProducts();
  const ids = products.map((p) => p.id);
  const params = await searchParams;
  const filter = parseActionFilter(params, ids);
  const view = parseActionsView(params.view);
  const focus = parseBoardFocus(params.focus);
  const counts = actionCounts(db, ids);
  const now = new Date();
  const today = isoDateIn(config.HARBOUR_TIMEZONE, now);
  const zone = { timeZone: config.HARBOUR_TIMEZONE, locale: config.HARBOUR_LOCALE };
  return (
    <div className={`mx-auto flex flex-col gap-6 ${view === "board" ? "max-w-7xl" : "max-w-3xl"}`}>
      <header>
        <h1 id="actions-heading" tabIndex={-1} className="font-serif text-3xl">
          Actions
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Things worth doing to get found more easily. You decide what happens to each.
        </p>
        <p className="mt-1 text-sm text-ink-muted tabular-nums">{boardSummary(counts)}</p>
      </header>
      <SyncFailureNote failures={syncFailures(db, products)} {...zone} />
      <ApprovalsNote waiting={approvalsWaiting(db, products)} />
      <ViewSwitch view={view} filter={filter} />
      <ActionFilters filter={filter} products={products} view={view} />
      {view === "board" && <FocusNotice focus={focus} filter={filter} />}
      {view === "board" ? (
        <Board
          board={loadBoard(db, { ...filter, focus }, now, products)}
          products={products}
          now={now}
          locale={zone.locale}
          today={today}
        />
      ) : (
        <ActionBoard
          {...boardActions(db, filter, ids)}
          filter={filter}
          products={products}
          today={today}
          {...zone}
        />
      )}
    </div>
  );
}
