import { z } from "zod";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { enqueueBackup } from "@/lib/ops/backup-schedule";

// Strict and empty: the day is always today's local date, computed here, never the client's.
const Body = z.strictObject({});

/** "Back up now": queues a backup of today for the worker (never runs it here), even when the schedule is off. */
export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const db = getDb();
  const day = isoDateIn(config.HARBOUR_TIMEZONE, new Date());
  const job = enqueueBackup(db, day, session.login);
  audit(db, { login: session.login, event: "backup_requested", detail: { jobId: job.id, day } });
  return Response.json({ jobId: job.id, created: job.created });
}
