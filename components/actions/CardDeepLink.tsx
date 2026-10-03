"use client";

import { useEffect, useState } from "react";
import { DEEP_LINK_TEXT } from "@/lib/explain/board";
import { deepLinkedId, everyStatusHref } from "./deep-link";
import { cardTitleId } from "./focus-after-change";

type Landing = { kind: "none" } | { kind: "missing"; href: string | null };

/**
 * Lands a `#action-<id>` link on its card, on the board or the list: scrolls the card into view
 * (sideways too, when its column is off screen) and focuses its title, so the owner sees where they
 * are. A card this page does not show gets one plain line and a link to the full list.
 */
export function CardDeepLink() {
  const [landing, setLanding] = useState<Landing>({ kind: "none" });
  useEffect(() => {
    const land = () => {
      const id = deepLinkedId(window.location.hash);
      if (id === null) return setLanding({ kind: "none" });
      const card = document.getElementById(`action-${id}`);
      if (!card) {
        return setLanding({
          kind: "missing",
          href: everyStatusHref(new URL(window.location.href), id),
        });
      }
      setLanding({ kind: "none" });
      card.scrollIntoView({ block: "center", inline: "center" });
      document.getElementById(cardTitleId(id))?.focus({ preventScroll: true });
    };
    land();
    window.addEventListener("hashchange", land);
    return () => window.removeEventListener("hashchange", land);
  }, []);
  if (landing.kind === "none") return null;
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 text-sm text-ink">
      <span>{DEEP_LINK_TEXT.missing}</span>
      {landing.href && (
        // A full load, so the list lands on the card afresh.
        <a
          href={landing.href}
          className="inline-flex min-h-11 items-center rounded-sm text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {DEEP_LINK_TEXT.everyStatus}
        </a>
      )}
    </p>
  );
}
