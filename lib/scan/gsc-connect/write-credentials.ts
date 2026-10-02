import { randomBytes } from "node:crypto";
import { link, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** What goes into the authorized-user file the worker reads (see gsc-credentials.ts). */
export type AuthorizedUser = { clientId: string; clientSecret: string; refreshToken: string };

function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    },
  );
}

function alreadyExists(path: string): Error {
  return new Error(`${path} already exists: pass --force to replace it.`);
}

/** Fails before any sign-in when `path` exists and `force` is off. */
export async function ensureWritable(path: string, force: boolean): Promise<void> {
  if (!force && (await exists(path))) throw alreadyExists(path);
}

/** Writes `text` to a new mode-600 file at `path` and flushes it to disk. */
async function writeSynced(path: string, text: string): Promise<void> {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(text, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
}

/**
 * Atomically writes the authorized-user file at `path` (mode 600, parent created with mode 700):
 * a temp file in the same folder, fsynced, then moved into place. Without `force`, an existing
 * file is never replaced, even one that appeared during sign-in.
 */
export async function writeAuthorizedUser(
  path: string,
  user: AuthorizedUser,
  { force }: { force: boolean },
): Promise<void> {
  const folder = dirname(path);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const temp = join(folder, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  const text = `${JSON.stringify({
    type: "authorized_user",
    client_id: user.clientId,
    client_secret: user.clientSecret,
    refresh_token: user.refreshToken,
  })}\n`;
  try {
    await writeSynced(temp, text);
    if (force) {
      await rename(temp, path);
      return;
    }
    // link() fails if the target exists, so a file created meanwhile is never clobbered.
    await link(temp, path).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw alreadyExists(path);
      }
      throw error;
    });
  } finally {
    await rm(temp, { force: true });
  }
}
