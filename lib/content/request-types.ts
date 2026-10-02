import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import type { ContentProduct } from "@/lib/products/content";

export type RequestContext = {
  db: Db;
  config: Config;
  login: string;
  now: Date;
  /** The brain folder (read only here) and the products with content on. */
  root: string;
  products: readonly ContentProduct[];
};
export type RequestResult =
  | { ok: true; jobIds: number[] }
  | { ok: false; status: number; error: string; message?: string };

export const refuse = (status: number, error: string, message?: string): RequestResult => ({
  ok: false,
  status,
  error,
  ...(message ? { message } : {}),
});

/** Shown when the brain's content folders can't be read at all (nothing is queued). */
export const BRAIN_UNREADABLE =
  "Harbour couldn't read the ideas folder, so it started nothing. Check the brain folder and try again.";
