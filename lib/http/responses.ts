/** Consistent JSON error body: `{ error: code }`. */
export function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
}
