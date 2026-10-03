import { readFileSync } from "node:fs";
import { parseHex, type Rgb } from "@/design/contrast";

export type Theme = "light" | "dark" | "system-dark" | "night";

const css = readFileSync(new URL("../../design/tokens.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function declarations(pattern: RegExp): Map<string, string> {
  const block = pattern.exec(css)?.[1];
  if (block === undefined) throw new Error(`design/tokens.css has no block matching ${pattern}`);
  return new Map(
    [...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
      m[1] ?? "",
      (m[2] ?? "").trim(),
    ]),
  );
}

const PRIMITIVES = declarations(/(?:^|\n):root\s*\{([^}]*)\}/);
const THEMES: Record<Theme, Map<string, string>> = {
  light: declarations(/:root,\s*\[data-theme="light"\]\s*\{([^}]*)\}/),
  dark: declarations(/\n\[data-theme="dark"\]\s*\{([^}]*)\}/),
  "system-dark": declarations(/\[data-theme="system"\]\s*\{([^}]*)\}/),
  night: declarations(/\n\[data-theme="night"\]\s*\{([^}]*)\}/),
};

/** A colour token in a theme, followed through var() to its #rrggbb primitive. */
export function themeColour(theme: Theme, token: string): Rgb {
  const lookup = (name: string) => THEMES[theme].get(name) ?? PRIMITIVES.get(name);
  let value = lookup(token);
  for (let hops = 0; value?.startsWith("var(") && hops < 5; hops++) {
    value = lookup(/^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1] ?? "");
  }
  if (!value) throw new Error(`No colour for --${token} in the ${theme} theme`);
  return parseHex(value);
}
