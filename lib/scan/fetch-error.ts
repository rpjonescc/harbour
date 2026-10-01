export const FETCH_ERROR_KINDS = [
  "timeout",
  "too_large",
  "redirect",
  "network",
  "blocked_by_robots",
] as const;

export type FetchErrorKind = (typeof FETCH_ERROR_KINDS)[number];

/** Why a safe fetch produced no response. */
export class FetchError extends Error {
  constructor(
    readonly kind: FetchErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "FetchError";
  }
}
