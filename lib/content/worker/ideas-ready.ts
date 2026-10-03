import { countWaitingIdeas, MAX_WAITING_IDEAS } from "@/lib/content/read/ideas";
import { readVoice } from "@/lib/content/read/voice";

/**
 * Whether a product may get new content ideas: a usable voice profile and room in its backlog.
 * An unreadable brain queues nothing and is logged once per product until it reads again.
 */
export function makeIdeasReadiness(root: string): (productId: string) => boolean {
  const warned = new Set<string>();
  return (productId) => {
    try {
      const ready =
        readVoice(root, productId).state === "ok" &&
        countWaitingIdeas(root, productId) < MAX_WAITING_IDEAS;
      warned.delete(productId);
      return ready;
    } catch {
      // Once per product until it reads again, not every 30 seconds.
      if (!warned.has(productId)) {
        warned.add(productId);
        console.warn(`ideas: could not read the brain for ${productId}; skipped`);
      }
      return false;
    }
  };
}
