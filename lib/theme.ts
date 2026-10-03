/** "night" is a chosen theme for late hours: darker and warmer than dark, never automatic. */
export type ThemePreference = "system" | "light" | "dark" | "night";

export const THEME_COOKIE = "harbour-theme";

const ORDER: ThemePreference[] = ["system", "light", "dark", "night"];

/** Reads a stored preference, falling back to following the OS. */
export function parseTheme(value: string | undefined): ThemePreference {
  return ORDER.includes(value as ThemePreference) ? (value as ThemePreference) : "system";
}

/** The preference the theme toggle moves to next. */
export function nextTheme(current: ThemePreference): ThemePreference {
  const index = ORDER.indexOf(current);
  return ORDER[(index + 1) % ORDER.length] ?? "system";
}
