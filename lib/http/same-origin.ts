import { jsonError } from "./responses";

/** CSRF guard for mutating routes: same origin and JSON only. Returns a response to send, or null. */
export function rejectCrossSite(request: Request, origin: string): Response | null {
  if (request.headers.get("origin") !== origin) return jsonError(403, "bad_origin");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) return jsonError(415, "json_required");
  return null;
}
