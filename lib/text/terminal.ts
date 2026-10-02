// Escape sequences: CSI (ESC [ or the 8-bit CSI), OSC (ESC ] … BEL or ST), and two-character ESC
// sequences. Untrusted text must not recolour, move the cursor, retitle or hyperlink a terminal.
const ESCAPES =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching escape sequences is the point
  /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[@-_]/g;

function isControl(char: string, keepLayout: boolean): boolean {
  if (keepLayout && (char === "\n" || char === "\t")) return false;
  const code = char.charCodeAt(0);
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/**
 * Untrusted text made safe to print in a terminal: escape sequences and C0/C1 control characters
 * (and DEL) removed. Newlines and tabs are kept with `multiline`, else they become spaces so one
 * field cannot forge extra lines of output.
 */
export function forTerminal(text: string, { multiline = false } = {}): string {
  const flat = multiline ? text : text.replace(/[\n\t]/g, " ");
  return [...flat.replace(ESCAPES, "")].filter((char) => !isControl(char, multiline)).join("");
}

/** Every string inside a JSON-shaped value passed through `forTerminal` (newlines kept). */
export function cleanStrings(value: unknown): unknown {
  if (typeof value === "string") return forTerminal(value, { multiline: true });
  if (Array.isArray(value)) return value.map(cleanStrings);
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanStrings(v)]));
}
