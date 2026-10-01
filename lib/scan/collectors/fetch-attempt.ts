import { FetchError } from "../fetch-error";
import type { SafeFetchResponse } from "../types";

/** The response, or the FetchError explaining why there is none; aborts still throw. */
export async function attempt(
  run: () => Promise<SafeFetchResponse>,
  signal: AbortSignal,
): Promise<SafeFetchResponse | FetchError> {
  try {
    return await run();
  } catch (error) {
    if (signal.aborted || !(error instanceof FetchError)) throw error;
    return error;
  }
}
