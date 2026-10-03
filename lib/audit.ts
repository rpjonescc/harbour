import type { Db } from "./db/client";
import { auditLog } from "./db/schema";

export type AuditEvent =
  | "login"
  | "login_failed"
  | "logout"
  | "passkey_registered"
  | "passkey_removed"
  | "setup_token_issued"
  | "setup_token_rejected"
  | "agent_run_requested"
  | "agent_run_cancelled"
  | "proposal_decided"
  | "scan_requested"
  | "outside_check_requested"
  | "action_created"
  | "action_status_changed"
  | "action_pr_linked"
  | "backup_requested"
  | "content_run_requested"
  | "content_decided";

/** Appends a security-relevant event to the audit log. */
export function audit(
  db: Db,
  entry: { login: string | null; event: AuditEvent; detail?: Record<string, unknown> },
  now: Date = new Date(),
): void {
  db.insert(auditLog)
    .values({ at: now, login: entry.login, event: entry.event, detail: entry.detail ?? null })
    .run();
}
