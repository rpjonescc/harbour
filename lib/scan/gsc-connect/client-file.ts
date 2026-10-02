import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

/** The OAuth client Harbour signs in with; the secret is never logged. */
export type OAuthClient = { clientId: string; clientSecret: string };

const PREFIX = "The OAuth client file";
/** Downloaded client files are well under 1 KiB; refuse anything bigger before reading it. */
const MAX_BYTES = 64 * 1024;

const DESKTOP_HELP =
  'Create a "Desktop app" OAuth client (Google Cloud → Google Auth Platform → Clients → ' +
  "Create client → Desktop app) and download its JSON.";

const installed = z.object({
  installed: z.object({ client_id: z.string().min(1), client_secret: z.string().min(1) }),
});

// Errors name fields, never values, and carry no `cause`: the content is secret.
/** Validates a downloaded Google OAuth client JSON; only Desktop app clients work here. */
export function parseOAuthClient(text: string): OAuthClient {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${PREFIX} is not valid JSON.`);
  }
  if (z.object({ web: z.unknown() }).safeParse(json).success) {
    throw new Error(
      `${PREFIX} is for a "Web application" client, which needs a registered redirect URI. ` +
        DESKTOP_HELP,
    );
  }
  if (!z.object({ installed: z.unknown() }).safeParse(json).success) {
    throw new Error(`${PREFIX} is not a Google OAuth client. ${DESKTOP_HELP}`);
  }
  const parsed = installed.safeParse(json);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`${PREFIX} is missing or has invalid: ${fields.join(", ")}.`);
  }
  const { client_id, client_secret } = parsed.data.installed;
  return { clientId: client_id, clientSecret: client_secret };
}

function readFailure(error: unknown): Error {
  const code = error instanceof Error && "code" in error ? String(error.code) : "unknown error";
  return new Error(`${PREFIX} could not be read (${code}).`);
}

/** Reads and validates the client file at `path`. */
export async function readOAuthClient(path: string): Promise<OAuthClient> {
  const info = await stat(path).catch((error: unknown) => {
    throw readFailure(error);
  });
  if (!info.isFile()) throw new Error(`${PREFIX} is not a regular file.`);
  if (info.size > MAX_BYTES) {
    throw new Error(`${PREFIX} is larger than 64 KiB: it is not a Google OAuth client file.`);
  }
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    throw readFailure(error);
  });
  return parseOAuthClient(text);
}
