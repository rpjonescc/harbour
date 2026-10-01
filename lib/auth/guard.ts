import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { SESSION_COOKIE } from "./cookies";
import { validateSession } from "./sessions";
import { resolveIdentity } from "./tailscale";

/** Both locks: a Tailscale identity and a valid passkey session bound to it. */
export async function getSession() {
  const identity = resolveIdentity(await headers(), getConfig());
  if (!identity.ok) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(getDb(), token, identity.login);
}

/** For pages and handlers that need a signed-in user. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
