export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; message?: string };

/** Same-origin JSON POST used by client components. Never throws. */
export async function postJson<T>(url: string, body: unknown = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    // A redirect means the API was bounced to a page (e.g. sign-in): never report that as success.
    if (response.redirected) return { ok: false, error: "bad_response" };
    const data = (await response.json().catch(() => undefined)) as
      | (T & { error?: string; message?: string })
      | undefined;
    if (!response.ok)
      return {
        ok: false,
        error: data?.error ?? `http_${response.status}`,
        ...(typeof data?.message === "string" ? { message: data.message } : {}),
      };
    if (data === undefined) return { ok: false, error: "bad_response" };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
