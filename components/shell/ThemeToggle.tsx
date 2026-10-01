"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { nextTheme, THEME_COOKIE, type ThemePreference } from "@/lib/theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Cycles system → light → dark; persisted per device in a cookie. */
export function ThemeToggle({ initial }: { initial: ThemePreference }) {
  const [theme, setTheme] = useState(initial);
  const Icon = ICONS[theme];

  function cycle() {
    const next = nextTheme(theme);
    document.documentElement.dataset.theme = next;
    // biome-ignore lint/suspicious/noDocumentCookie: per-device theme preference; no server round-trip needed
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=strict; secure`;
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-muted hover:text-ink"
    >
      <Icon aria-hidden="true" className="size-4" />
      <span>Theme: {theme}</span>
    </button>
  );
}
