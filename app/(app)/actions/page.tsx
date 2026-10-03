import { ActionBoard } from "@/components/actions/ActionBoard";
import { ActionFilters } from "@/components/actions/ActionFilters";
import { ApprovalsNote } from "@/components/actions/ApprovalsNote";
import { BOARD_HEADING_ID } from "@/components/actions/focus-after-change";
import { SyncFailureNote } from "@/components/actions/SyncFailureNote";
import { PageHeader } from "@/components/explain/PageHeader";
import { approvalsWaiting, syncFailures } from "@/lib/actions/board-notices";
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
  const filter = parseActionFilter(await searchParams, ids);
  const { groups, more } = boardActions(db, filter, ids);
  const counts = actionCounts(db, ids);
  const zone = { timeZone: config.HARBOUR_TIMEZONE, locale: config.HARBOUR_LOCALE };
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Actions"
        page="actions"
        titleId={BOARD_HEADING_ID}
        intro={
          <>
            <p>Things worth doing to get found more easily. You decide what happens to each.</p>
            <p className="tabular-nums">{boardSummary(counts)}</p>
          </>
        }
      />
      <SyncFailureNote failures={syncFailures(db, products)} {...zone} />
      <ApprovalsNote waiting={approvalsWaiting(db, products)} />
      <ActionFilters filter={filter} products={products} />
      <ActionBoard
        groups={groups}
        more={more}
        filter={filter}
        products={products}
        today={isoDateIn(config.HARBOUR_TIMEZONE, new Date())}
        {...zone}
      />
    </div>
  );
}
