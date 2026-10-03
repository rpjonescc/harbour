// Which system lights get a sentence under the strip (spec §4.3): only those that are not fine,
// worst first, at most five. Pure.

import type { LightTone } from "@/lib/explain/tower";
import { type Light, pressing } from "./system";

/** At most this many sentences show under the strip; the rest are counted. */
export const TROUBLE_CAP = 5;

/** Busy and switched-off lights are fine: working now, or off on purpose. */
const NOT_FINE: ReadonlySet<LightTone> = new Set(["act", "watch", "unknown"]);

/** The lights that are not fine, most pressing first (fixed order within a tone), capped at 5. */
export function troubleLights(lights: readonly Light[]): { shown: Light[]; more: number } {
  const all = lights.filter((l) => NOT_FINE.has(l.tone)).sort((a, b) => pressing(a.tone, b.tone));
  return { shown: all.slice(0, TROUBLE_CAP), more: Math.max(0, all.length - TROUBLE_CAP) };
}
