import { notFound } from "next/navigation";
import { ContentPage } from "@/components/content/ContentPage";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { contentView } from "@/lib/content/read/view";
import { readVoiceTemplate } from "@/lib/content/voice-template";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { getContentProducts } from "@/lib/products/catalog";

export default async function Page() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  if (config.HARBOUR_CONTENT !== "on") notFound();
  const view = contentView({
    db: getDb(),
    root: config.HARBOUR_BRAIN_DIR,
    products: getContentProducts(),
    today: isoDateIn(config.HARBOUR_TIMEZONE, new Date()),
    tokenSet: Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN),
  });
  return <ContentPage view={view} template={readVoiceTemplate()} />;
}
