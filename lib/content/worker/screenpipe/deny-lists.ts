import { matchKey } from "./canonical";

// Step 1 of the filter (spec §5.3): which apps and windows are never read.

/** Apps whose text is never read: password managers, email, chat, calls, banking and payments. */
export const BUILT_IN_EXCLUDED_APPS = [
  "1password",
  "bitwarden",
  "keepass",
  "lastpass",
  "dashlane",
  "keychain",
  "mail",
  "outlook",
  "thunderbird",
  "slack",
  "discord",
  "teams",
  "whatsapp",
  "signal",
  "telegram",
  "messages",
  "messenger",
  "zoom",
  "facetime",
  "webex",
  "meet",
  "bank",
  "paypal",
  "venmo",
  "wise",
  "revolut",
  "quickbooks",
  "xero",
  "stripe",
  "private",
  "incognito",
] as const;
export const DENY_WINDOW_PATTERNS = [
  "password",
  "login",
  "sign in",
  "bank",
  "invoice",
  "payroll",
  "private",
  "incognito",
  "inbox",
  // Webmail, web chat, web banking and password managers open in a browser: the app is "Chrome",
  // so only the window title says what it is.
  "gmail",
  "webmail",
  "proton",
  "compose mail",
  "log in",
  "private browsing",
  "slack",
  "discord",
  "whatsapp",
  "messenger",
  "1password",
  "bitwarden",
  "lastpass",
  "dashlane",
  "keepass",
  "paypal",
  "online banking",
] as const;

// File extensions: a title like "login.ts" or "docker-compose.yml" is an editor tab, not a login page.
const FILE_NAME =
  /[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|yml|yaml|toml|py|rs|go|rb|java|kt|swift|c|h|cpp|cs|php|sh|sql|css|scss|html|txt|csv|lock|env|ini|cfg|conf|log)(?![\w])/g;
const BROWSERS = [
  "chrome",
  "chromium",
  "firefox",
  "safari",
  "edge",
  "brave",
  "opera",
  "vivaldi",
  "arc",
  "zen",
];

const hasWord = (haystack: string, word: string): boolean =>
  new RegExp(`(?<![a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(
    haystack,
  );

const isBrowser = (appKey: string): boolean => BROWSERS.some((name) => hasWord(appKey, name));

export const containsAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((n) => haystack.includes(n));

/**
 * True when an app or window name (either may be empty, meaning "not given") is on a deny-list.
 * `excluded` is the matching keys of the built-in and the owner's excluded apps. A value that is
 * not text is unknown, and unknown is private.
 */
export function isDeniedByNames(
  app: unknown,
  window: unknown,
  excluded: readonly string[],
): boolean {
  if (typeof app !== "string" || typeof window !== "string") return true;
  const appKey = matchKey(app);
  const windowKey = matchKey(window);
  const titleKey = windowKey.replace(FILE_NAME, " ");
  // A browser tab can be webmail or chat, so the window title is held to the app list as well.
  return (
    containsAny(appKey, excluded) ||
    containsAny(titleKey, DENY_WINDOW_PATTERNS) ||
    ((isBrowser(appKey) || excluded.includes(windowKey)) &&
      excluded.some((name) => hasWord(windowKey, name)))
  );
}
