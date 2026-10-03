import { existsSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

/** WebAuthn requires the RP id to be the origin's host or a registrable suffix of it. */
function rpIdMatchesOrigin(rpId: string, origin: string): boolean {
  // An invalid origin is already reported by its own field check.
  if (!URL.canParse(origin)) return true;
  const hostname = new URL(origin).hostname;
  return hostname === rpId || hostname.endsWith(`.${rpId}`);
}

/** Whether Harbour is served on this machine only (http://localhost, 127.0.0.1 or [::1]). */
function isLoopbackOrigin(origin: string): boolean {
  if (!URL.canParse(origin)) return false;
  const { protocol, hostname } = new URL(origin);
  return protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

/** An http origin on this machine only, with no path: the Screenpipe key must never cross a network. */
export function isLoopbackHttpOrigin(value: string): boolean {
  return isLoopbackOrigin(value) && new URL(value).origin === value;
}

/** `path` absolute with symlinks resolved, through its nearest existing ancestor if it does not exist yet. */
function realPath(path: string): string {
  let existing = resolve(path);
  const rest: string[] = [];
  while (!existsSync(existing) && dirname(existing) !== existing) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(existsSync(existing) ? realpathSync(existing) : existing, ...rest);
}

/** Whether `path` is `dir` or inside it, compared as real absolute paths. */
function isInside(path: string, dir: string): boolean {
  const rel = relative(realPath(dir), realPath(path));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Backups are pruned by name, so they need a folder of their own, not a shared one. */
function isSharedFolder(path: string): boolean {
  const real = realPath(path);
  return ["/", homedir(), tmpdir(), "/tmp"].some((shared) => realPath(shared) === real);
}

const flag = z
  .enum(["0", "1"])
  .default("0")
  .transform((v) => v === "1");

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function isLocale(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale).length === 1;
  } catch {
    return false;
  }
}

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HARBOUR_ALLOWED_LOGINS: z
      .string()
      .transform((raw) =>
        raw
          .split(",")
          .map((login) => login.trim().toLowerCase())
          .filter((login) => login.length > 0),
      )
      .pipe(z.array(z.string()).min(1, "HARBOUR_ALLOWED_LOGINS must list at least one login")),
    HARBOUR_ORIGIN: z.url().refine((v) => URL.canParse(v) && new URL(v).origin === v, {
      message:
        "HARBOUR_ORIGIN must be an origin like https://host.ts.net (no path or trailing slash)",
    }),
    HARBOUR_RP_ID: z.string().min(1),
    HARBOUR_DB_PATH: z.string().min(1).default("./data/harbour.db"),
    HARBOUR_CONFIG_PATH: z.string().min(1).optional(),
    HARBOUR_TIMEZONE: z
      .string()
      .min(1)
      .default(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
      .refine(isTimeZone, { message: "HARBOUR_TIMEZONE must be an IANA zone like Europe/London" }),
    HARBOUR_LOCALE: z
      .string()
      .min(1)
      .default("en-US")
      .refine(isLocale, { message: "HARBOUR_LOCALE must be a BCP 47 locale like en-GB" }),
    HARBOUR_BRAIN_DIR: z.string().min(1).default("./brain"),
    HARBOUR_EDITOR_URL_TEMPLATE: z
      .string()
      .default("vscode://file/{path}")
      .refine((v) => v === "" || v.includes("{path}"), {
        message: "HARBOUR_EDITOR_URL_TEMPLATE must contain {path}, or be empty to hide the button",
      }),
    HARBOUR_DEV_IDENTITY: z.string().min(1).optional(),
    HARBOUR_CLAUDE_BIN: z.string().min(1).default("claude"),
    // Secret: long-lived subscription token from `claude setup-token`. Worker only.
    HARBOUR_CLAUDE_OAUTH_TOKEN: z.string().min(1).optional(),
    // Full model id (aliases like "sonnet" can resolve to an older model).
    HARBOUR_AGENT_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
    HARBOUR_AGENT_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(30),
    // Most pages the crawler fetches per product per scan.
    HARBOUR_CRAWL_MAX_PAGES: z.coerce.number().int().min(1).max(500).default(200),
    // "off" stops the worker queueing the daily and catch-up scans (`pnpm scan:now` still works).
    HARBOUR_SCHEDULED_SCANS: z.enum(["on", "off"]).default("on"),
    // "off" stops the worker queueing the weekly analyst run (Run now and `pnpm analyst:now` still work).
    HARBOUR_SCHEDULED_ANALYST: z.enum(["on", "off"]).default("on"),
    // "off" stops the worker queueing the monthly research refresh (Update old research on the Agents page still works).
    HARBOUR_SCHEDULED_RESEARCH: z.enum(["on", "off"]).default("on"),
    // "quiet" turns off the daily note, the note card on Today and the wave.
    HARBOUR_PERSONALITY: z.enum(["warm", "quiet"]).default("warm"),
    // Local time (HARBOUR_TIMEZONE) the worker writes the daily note.
    HARBOUR_NOTE_TIME: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HARBOUR_NOTE_TIME must be HH:MM, 24-hour, like 06:30")
      .default("06:30"),
    // "off" stops the worker queueing the daily note (Write me a fresh one still works).
    HARBOUR_SCHEDULED_NOTE: z.enum(["on", "off"]).default("on"),
    // "on" turns on the content machine (Content page, digest, ideas, drafting). Off by default:
    // reading Screenpipe is sensitive, so it is opted into deliberately.
    HARBOUR_CONTENT: z.enum(["on", "off"]).default("off"),
    // Screenpipe's local API. Loopback only, so its bearer key never leaves this machine.
    HARBOUR_SCREENPIPE_URL: z
      .string()
      .default("http://127.0.0.1:3030")
      .refine(isLoopbackHttpOrigin, {
        message:
          "HARBOUR_SCREENPIPE_URL must be an http origin on 127.0.0.1, [::1] or localhost, like http://127.0.0.1:3030",
      }),
    // Secret: from `screenpipe auth token`. Worker only. Unset means no activity digest (a gap).
    HARBOUR_SCREENPIPE_API_KEY: z.string().min(1).optional(),
    // "off" stops the worker queueing the daily activity digest ("Make today's digest now" still works).
    HARBOUR_SCHEDULED_DIGEST: z.enum(["on", "off"]).default("on"),
    // Local time (HARBOUR_TIMEZONE) the worker makes the digest of the day before.
    HARBOUR_DIGEST_TIME: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HARBOUR_DIGEST_TIME must be HH:MM, 24-hour, like 05:45")
      .default("05:45"),
    // "off" stops the worker queueing Monday's idea run ("Find new ideas" still works).
    HARBOUR_SCHEDULED_IDEAS: z.enum(["on", "off"]).default("on"),
    // Content agent runs per local day, scheduled and manual together.
    HARBOUR_CONTENT_DAILY_RUNS: z.coerce.number().int().min(1).max(100).default(24),
    // The folder holding the installed skills (no-ai-slop, humanizer, atomizer).
    HARBOUR_SKILLS_DIR: z
      .string()
      .min(1)
      .refine(
        (v) => !v.startsWith("~"),
        "HARBOUR_SKILLS_DIR needs a full path: the shell does not expand ~ in .env",
      )
      .default(() => join(homedir(), ".claude", "skills")),
    // Where nightly backups go; default `<folder of HARBOUR_DB_PATH>/backups`. Never in the brain.
    HARBOUR_BACKUP_DIR: z.string().min(1).optional(),
    // "off" stops the worker queueing the nightly backup (`pnpm backup:now` still works).
    HARBOUR_SCHEDULED_BACKUP: z.enum(["on", "off"]).default("on"),
    // Scans per product whose observations retention keeps (after each verified backup).
    HARBOUR_OBSERVATION_SCANS_KEPT: z.coerce.number().int().min(7).max(365).default(30),
    // Secret: Google API key for PageSpeed Insights; without one it is not connected. Worker only.
    HARBOUR_PAGESPEED_API_KEY: z.string().min(1).optional(),
    // Path to a Google credentials JSON file for Search Console (secret, mode 600). Worker only.
    HARBOUR_GSC_CREDENTIALS: z.string().min(1).optional(),
    // Monthly cap on paid API spend in AUD; 0 (the default) means no paid calls at all.
    HARBOUR_MONTHLY_BUDGET_AUD: z.coerce.number().min(0).max(10000).multipleOf(0.01).default(0),
    // Secret: Treg API key (rankings, links and AI answer checks). Worker only. Unset: not connected.
    HARBOUR_TREG_API_KEY: z.string().min(1).optional(),
    // Treg charges in US dollars; the ledger and budget are in Australian dollars.
    HARBOUR_USD_TO_AUD: z.coerce.number().min(1).max(3).default(1.55),
    // Secret: DataForSEO API login. Reserved: read only for its status until its collector exists.
    HARBOUR_DATAFORSEO_LOGIN: z.string().min(1).optional(),
    // Secret: DataForSEO API password. Reserved: read only for its status until its collector exists.
    HARBOUR_DATAFORSEO_PASSWORD: z.string().min(1).optional(),
    // Secret: OpenAI API key. Reserved: read only for its status until its collector exists.
    HARBOUR_OPENAI_API_KEY: z.string().min(1).optional(),
    // Secret: Perplexity API key. Reserved: read only for its status until its collector exists.
    HARBOUR_PERPLEXITY_API_KEY: z.string().min(1).optional(),
    // Secret: Gemini API key. Reserved: read only for its status until its collector exists.
    HARBOUR_GEMINI_API_KEY: z.string().min(1).optional(),
    // Test only: marks the E2E environment. Refused unless Harbour runs on a loopback origin.
    HARBOUR_TEST_MODE: flag,
    // Test only: lets scans reach 127.0.0.1 / ::1 (the E2E fixture site). Needs HARBOUR_TEST_MODE.
    HARBOUR_SCAN_ALLOW_LOOPBACK: flag,
  })
  .refine((c) => rpIdMatchesOrigin(c.HARBOUR_RP_ID, c.HARBOUR_ORIGIN), {
    message: "HARBOUR_RP_ID must equal HARBOUR_ORIGIN's hostname or be a parent domain of it",
    path: ["HARBOUR_RP_ID"],
  })
  // A deployed Harbour has an https tailnet origin, so it can never turn test mode on.
  .refine((c) => !c.HARBOUR_TEST_MODE || isLoopbackOrigin(c.HARBOUR_ORIGIN), {
    message: "HARBOUR_TEST_MODE is for tests only: HARBOUR_ORIGIN must be http://localhost",
    path: ["HARBOUR_TEST_MODE"],
  })
  .refine((c) => !c.HARBOUR_SCAN_ALLOW_LOOPBACK || c.HARBOUR_TEST_MODE, {
    message: "HARBOUR_SCAN_ALLOW_LOOPBACK is for tests only: it needs HARBOUR_TEST_MODE=1",
    path: ["HARBOUR_SCAN_ALLOW_LOOPBACK"],
  })
  .refine((c) => !c.HARBOUR_BACKUP_DIR || !isSharedFolder(c.HARBOUR_BACKUP_DIR), {
    message:
      "HARBOUR_BACKUP_DIR must be a dedicated folder, not /, your home folder or the temp folder",
    path: ["HARBOUR_BACKUP_DIR"],
  })
  // The brain is pushed to a remote; backups hold session hashes and the audit log.
  .refine((c) => !c.HARBOUR_BACKUP_DIR || !isInside(c.HARBOUR_BACKUP_DIR, c.HARBOUR_BRAIN_DIR), {
    message:
      "HARBOUR_BACKUP_DIR must not be inside HARBOUR_BRAIN_DIR (the brain is pushed to a remote)",
    path: ["HARBOUR_BACKUP_DIR"],
  })
  .refine((c) => !isInside(c.HARBOUR_SKILLS_DIR, c.HARBOUR_BRAIN_DIR), {
    message:
      "HARBOUR_SKILLS_DIR must not be inside HARBOUR_BRAIN_DIR (the brain is pushed to a remote)",
    path: ["HARBOUR_SKILLS_DIR"],
  })
  .refine((c) => !(c.NODE_ENV === "production" && c.HARBOUR_DEV_IDENTITY), {
    message: "HARBOUR_DEV_IDENTITY must not be set in production",
    path: ["HARBOUR_DEV_IDENTITY"],
  });

export type Config = z.infer<typeof schema>;

/** Validates environment variables; throws with a readable message when invalid. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  return schema.parse(env);
}

let cached: Config | undefined;

/** Process-wide config, validated once. */
export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}
