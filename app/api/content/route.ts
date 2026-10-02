import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { ContentBody, requestContent } from "@/lib/content/request";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";
import { getContentProducts } from "@/lib/products/catalog";

const MAX_REQUEST_CHARS = 100_000;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  // The biggest request is an edit (20,000 characters); anything far past that is not parsed at all.
  const text = await request.text().catch(() => "");
  if (text.length > MAX_REQUEST_CHARS) return jsonError(413, "too_large");
  const body = ContentBody.safeParse(parseJson(text));
  if (!body.success) return jsonError(400, "invalid_request");
  const result = requestContent(
    {
      db: getDb(),
      config,
      login: session.login,
      now: new Date(),
      root: config.HARBOUR_BRAIN_DIR,
      products: getContentProducts(),
    },
    body.data,
  );
  if (!result.ok) {
    return Response.json(
      { error: result.error, ...(result.message ? { message: result.message } : {}) },
      { status: result.status },
    );
  }
  return Response.json({ jobIds: result.jobIds });
}
