// Which keys Harbour has, for Settings. Web-safe: checks presence only, never reads a value out.

import { statSync } from "node:fs";
import type { Config } from "@/lib/config";
import { PAID_SOURCES } from "@/lib/costs/paid-sources";

export type KeyStatus = "present" | "missing" | "file-not-found";

export type KeyRow = {
  id: string;
  label: string;
  status: KeyStatus;
  /** False for a source whose collector does not exist yet ("not used yet"). */
  inUse: boolean;
  paid: boolean;
};

/** Whether `path` names a regular file (following symlinks, as the worker's read does). */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const isSet = (config: Config, key: keyof Config) => {
  const value = config[key];
  return value !== undefined && value !== "";
};

const presence = (config: Config, keys: readonly (keyof Config)[]): KeyStatus =>
  keys.every((key) => isSet(config, key)) ? "present" : "missing";

/** Every key Harbour reads or will read; status only (never a value, length or path). */
export function keyStatusRows(
  config: Config,
  fileExists: (path: string) => boolean = isFile,
): KeyRow[] {
  const gsc = config.HARBOUR_GSC_CREDENTIALS;
  return [
    {
      id: "claude",
      label: "Claude token",
      status: presence(config, ["HARBOUR_CLAUDE_OAUTH_TOKEN"]),
      inUse: true,
      paid: false,
    },
    {
      id: "pagespeed",
      label: "PageSpeed Insights",
      status: presence(config, ["HARBOUR_PAGESPEED_API_KEY"]),
      inUse: true,
      paid: false,
    },
    {
      id: "search-console",
      label: "Search Console",
      status: !gsc ? "missing" : fileExists(gsc) ? "present" : "file-not-found",
      inUse: true,
      paid: false,
    },
    ...PAID_SOURCES.map((source) => ({
      id: source.id,
      label: source.label,
      status: presence(config, source.settings),
      inUse: source.collector !== null,
      paid: true,
    })),
  ];
}
