import { audit } from "@/lib/audit";
import { issueSetupToken } from "@/lib/auth/setup-tokens";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";

// Prints a one-time link that registers a passkey. Run on the Harbour PC only.
const db = getDb();
const { token, expiresAt } = issueSetupToken(db);
audit(db, { login: null, event: "setup_token_issued", detail: { via: "cli" } });
const { HARBOUR_ORIGIN, HARBOUR_LOCALE, HARBOUR_TIMEZONE } = getConfig();
const url = new URL("/setup", HARBOUR_ORIGIN);
url.searchParams.set("token", token);
console.log(
  `\nOpen this link on the device to register (expires ${expiresAt.toLocaleTimeString(HARBOUR_LOCALE, { timeZone: HARBOUR_TIMEZONE })}):\n\n  ${url}\n`,
);
