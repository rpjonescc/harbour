import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

/** A Search Console credential, validated; secrets stay in the worker and are never logged. */
export type GscCredentials =
  | { type: "service_account"; clientEmail: string; privateKey: string }
  | { type: "authorized_user"; clientId: string; clientSecret: string; refreshToken: string };

export type GscCredentialsFile =
  | { state: "missing" }
  /** `warning` says why the file's permissions are unsafe; null when they are fine. */
  | { state: "ok"; credentials: GscCredentials; warning: string | null };

const PREFIX = "The Search Console credentials file";

const serviceAccount = z
  .object({ client_email: z.string().min(1), private_key: z.string().min(1) })
  .transform(
    (raw): GscCredentials => ({
      type: "service_account",
      clientEmail: raw.client_email,
      privateKey: raw.private_key,
    }),
  );

const authorizedUser = z
  .object({
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    refresh_token: z.string().min(1),
  })
  .transform(
    (raw): GscCredentials => ({
      type: "authorized_user",
      clientId: raw.client_id,
      clientSecret: raw.client_secret,
      refreshToken: raw.refresh_token,
    }),
  );

const SCHEMAS = { service_account: serviceAccount, authorized_user: authorizedUser } as const;

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Group or other permission bits make a secrets file readable beyond its owner. */
function modeWarning(mode: number): string | null {
  const permissions = mode & 0o777;
  if ((permissions & 0o077) === 0) return null;
  const octal = permissions.toString(8);
  return `${PREFIX} has mode ${octal}, so other users can read it: run chmod 600 on it.`;
}

// Errors name fields, never values, and carry no `cause`: the content is secret.
function parseCredentials(text: string): GscCredentials {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${PREFIX} is not valid JSON.`);
  }
  const type = z.object({ type: z.enum(["service_account", "authorized_user"]) }).safeParse(json);
  if (!type.success) {
    throw new Error(
      `${PREFIX} must be a service account key (type "service_account") or an OAuth ` +
        'authorized-user file (type "authorized_user").',
    );
  }
  const parsed = SCHEMAS[type.data.type].safeParse(json);
  if (parsed.success) return parsed.data;
  const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
  throw new Error(
    `${PREFIX} is not a usable "${type.data.type}" file (missing or invalid: ${fields.join(", ")}).`,
  );
}

/** Reads and validates the credentials file at `path`; "missing" only when it does not exist. */
export async function readGscCredentials(path: string): Promise<GscCredentialsFile> {
  let text: string;
  let mode: number;
  try {
    mode = (await stat(path)).mode;
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return { state: "missing" };
    const code = error instanceof Error && "code" in error ? String(error.code) : "unknown error";
    throw new Error(`${PREFIX} could not be read (${code}).`);
  }
  return { state: "ok", credentials: parseCredentials(text), warning: modeWarning(mode) };
}
