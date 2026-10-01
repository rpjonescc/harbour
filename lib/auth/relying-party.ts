import type { Config } from "@/lib/config";

export type RelyingParty = { id: string; name: string; origin: string };

/** WebAuthn relying party derived from config. */
export function relyingParty(config: Config): RelyingParty {
  return { id: config.HARBOUR_RP_ID, name: "Harbour", origin: config.HARBOUR_ORIGIN };
}
