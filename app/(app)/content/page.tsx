import { notFound } from "next/navigation";
import { ContentPage } from "@/components/content/ContentPage";
import { requireSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { sendablePlatforms } from "@/lib/content/postiz/channels";
import { contentView } from "@/lib/content/read/view";
import { readVoiceTemplate } from "@/lib/content/voice-template";
import { getDb } from "@/lib/db/client";
import { formatDateTime, isoDateIn } from "@/lib/format/date";
import { getContentProducts, getPostizChannels } from "@/lib/products/catalog";

export default async function Page() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  const config = getConfig();
  if (config.HARBOUR_CONTENT !== "on") notFound();
  const postizPlatforms = sendablePlatforms(config, getPostizChannels());
  const view = contentView({
    db: getDb(),
    root: config.HARBOUR_BRAIN_DIR,
    products: getContentProducts(),
    today: isoDateIn(config.HARBOUR_TIMEZONE, new Date()),
    tokenSet: Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN),
    // Only the platforms with a channel, and only while Postiz is set up; never the key.
    postiz:
      postizPlatforms.length > 0
        ? {
            platforms: postizPlatforms,
            when: (iso) =>
              formatDateTime(new Date(iso), config.HARBOUR_TIMEZONE, config.HARBOUR_LOCALE),
          }
        : undefined,
  });
  return <ContentPage view={view} template={readVoiceTemplate()} />;
}
