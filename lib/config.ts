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
    // Secret: Google API key for PageSpeed Insights; without one it is not connected. Worker only.
    HARBOUR_PAGESPEED_API_KEY: z.string().min(1).optional(),
    // Path to a Google credentials JSON file for Search Console (secret, mode 600). Worker only.
    HARBOUR_GSC_CREDENTIALS: z.string().min(1).optional(),
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
