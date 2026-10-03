import { TowerView } from "@/components/tower";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { noteEnabled } from "@/lib/note/schedule";
import { noteSlot } from "@/lib/note/view";
import { getProducts } from "@/lib/products/catalog";
import { loadTower } from "@/lib/tower/load";

export default async function TodayPage() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  const now = new Date();
  const db = getDb();
  const tokenSet = Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN);
  const tower = loadTower(db, config, getProducts(), now);
  return (
    <TowerView
      tower={tower}
      note={noteSlot({
        db,
        personality: config.HARBOUR_PERSONALITY,
        isSample: tower.isSample,
        root: config.HARBOUR_BRAIN_DIR,
        timeZone: config.HARBOUR_TIMEZONE,
        noteTime: config.HARBOUR_NOTE_TIME,
        // Without a token the worker skips the scheduled note, so none is promised.
        scheduled: noteEnabled(config) && tokenSet,
        tokenSet,
        now,
      })}
      now={now}
      timeZone={config.HARBOUR_TIMEZONE}
      locale={config.HARBOUR_LOCALE}
    />
  );
}
