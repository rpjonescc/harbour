export type FetchErrorKind = "timeout" | "too_large" | "redirect" | "network" | "blocked_by_robots";

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
