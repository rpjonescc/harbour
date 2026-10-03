import { FetchError } from "./fetch-error";

// Only Treg's own header family may be sent, so a caller cannot override Host, Content-Length,
// Authorization or anything else the transport owns, nor smuggle in a second header line.
const NAME = /^x-treg-[a-z-]{1,40}$/;
const VALUE = /^[ -~]{1,200}$/;

/** The request headers a custom-header POST sends: lowercased, each name and value checked. */
export function checkedCustomHeaders(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const checked: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    // Messages never repeat the value: it may be a secret.
    if (!NAME.test(lower)) throw new FetchError("network", "A custom header name is not allowed");
    if (!VALUE.test(value)) throw new FetchError("network", `Custom header ${lower} is invalid`);
    if (lower in checked) throw new FetchError("network", `Custom header ${lower} is repeated`);
    checked[lower] = value;
  }
  return checked;
}

/** Whether a (lowercased) response header is one of Treg's. */
export const isTregHeader = (name: string): boolean => name.startsWith("x-treg-");

/** The `x-treg-*` response headers only. */
export function tregHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const own: Record<string, string> = Object.create(null);
  for (const [name, value] of Object.entries(headers)) if (isTregHeader(name)) own[name] = value;
  return own;
}
