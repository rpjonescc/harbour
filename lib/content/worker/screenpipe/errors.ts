export type FailureKind =
  | "not-running"
  | "key-refused"
  | "not-recording"
  | "no-capture"
  | "too-large"
  | "redirected"
  | "bad-response";

/** A Screenpipe problem with a kind the digest job turns into a plain sentence. */
export class ScreenpipeError extends Error {
  constructor(readonly kind: FailureKind) {
    super(kind);
  }
}
