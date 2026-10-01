import { getSession } from "@/lib/auth/guard";
import { ensureBrain } from "@/lib/brain/runtime";
import { searchBrain } from "@/lib/brain/search";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";

export async function GET(request: Request) {
  if (!(await getSession())) return jsonError(401, "unauthenticated");
  if (!ensureBrain().available) return Response.json({ hits: [] });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ hits: searchBrain(getDb(), query) });
}
