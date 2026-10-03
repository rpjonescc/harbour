// The Postiz client: worker only. It lists channels and creates drafts, and nothing else: there is
// no way here to schedule, publish, change or delete a post (spec §11). The key never leaves it.

import { z } from "zod";
import { isPostizUrl } from "@/lib/config";
import { channelIdSchema } from "@/lib/content/postiz/channels";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

export type PostizFailure =
  | "unreachable"
  | "key-refused"
  | "refused"
  | "rate-limited"
  | "server-error"
  | "redirected"
  | "too-large"
  | "bad-response";

/** A Postiz problem with a kind the job turns into a plain sentence; it never carries the key. */
export class PostizError extends Error {
  constructor(readonly kind: PostizFailure) {
    super(kind);
  }
}

export type PostizSettings = {
  /** The backend address, as `HARBOUR_POSTIZ_URL` holds it (it ends in /api). */
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
};

/** One connected channel: its id, its kind (Postiz's `identifier`) and whether it is switched off. */
export type PostizChannel = { id: string; kind: string; disabled: boolean };

/** What a draft is made of; there is deliberately no `type` here. */
export type DraftInput = { channelId: string; kind: string; text: string; date: Date };

// Only the fields Harbour uses; everything else Postiz sends is dropped unread.
const channelsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(200),
      identifier: z.string().min(1).max(60),
      disabled: z.boolean().default(false),
    }),
  )
  .max(500);
const createdSchema = z.array(z.object({ postId: channelIdSchema })).min(1);

/** Settings each channel kind needs (docs: providers). For a draft Postiz checks only the text. */
const SETTINGS: Readonly<Record<string, Record<string, string>>> = {
  linkedin: {},
  "linkedin-page": {},
  facebook: {},
  instagram: { post_type: "post" },
  "instagram-standalone": { post_type: "post" },
};

/** The create-post body for one draft. The type is the literal "draft", fixed here and nowhere else. */
export function buildDraftRequest(input: DraftInput) {
  const extra = Object.hasOwn(SETTINGS, input.kind) ? SETTINGS[input.kind] : undefined;
  if (!extra) throw new Error("Harbour can't make a draft for this kind of Postiz channel");
  return {
    type: "draft" as const,
    date: input.date.toISOString(),
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: input.channelId },
        value: [{ content: input.text, image: [] }],
        settings: { __type: input.kind, ...extra },
      },
    ],
  };
}

function failureFor(status: number): PostizFailure {
  if (status === 401 || status === 403) return "key-refused";
  if (status === 429) return "rate-limited";
  return status >= 500 ? "server-error" : "refused";
}

/** The body as text, read as a stream and dropped as soon as it passes the cap. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new PostizError("bad-response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new PostizError("too-large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PostizError) throw error;
    throw new PostizError("unreachable"); // the timeout, or the connection dropped
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function call<T>(
  settings: PostizSettings,
  path: "/integrations" | "/posts",
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  // Defence in depth beside the config check: the key can publish, so it goes nowhere else.
  if (!isPostizUrl(settings.baseUrl))
    throw new Error("Postiz must be on this machine or the tailnet");
  if (!/^[!-~]+$/.test(settings.apiKey)) {
    throw new Error("The Postiz key is empty or has characters a header cannot hold");
  }
  const url = `${settings.baseUrl.replace(/\/+$/, "")}/public/v1${path}`;
  let response: Response;
  try {
    // Redirects are never followed (they could carry the key elsewhere). No retries.
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: settings.apiKey,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
      signal: AbortSignal.timeout(settings.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PostizError("unreachable");
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new PostizError("redirected");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new PostizError(failureFor(response.status));
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readCapped(response));
  } catch (error) {
    if (error instanceof PostizError) throw error;
    throw new PostizError("bad-response");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new PostizError("bad-response");
  return parsed.data;
}

/** The channels connected in Postiz (GET /integrations). */
export async function listChannels(settings: PostizSettings): Promise<PostizChannel[]> {
  const rows = await call(settings, "/integrations", undefined, channelsSchema);
  return rows.map((row) => ({ id: row.id, kind: row.identifier, disabled: row.disabled }));
}

/** Creates one draft (POST /posts) and returns Postiz's id for it. Nothing is scheduled or posted. */
export async function createDraft(settings: PostizSettings, input: DraftInput): Promise<string> {
  const created = await call(settings, "/posts", buildDraftRequest(input), createdSchema);
  // Safe: the schema requires at least one row.
  return (created[0] as { postId: string }).postId;
}
