import { z } from "zod";

export type Snippet = { app: string; window: string | null; text: string };
export type Activity = { dataStatus: "ok" | "empty_but_recording"; snippets: Snippet[] };

/**
 * The only fields read from /activity-summary. A plain `z.object` drops every other field
 * unread (key texts, memories, apps, guidance): the less of the owner's screen Harbour sees, the
 * less can leak. An unknown `data_status` fails the parse rather than being read as "ok".
 */
export const activitySchema = z.object({
  data_status: z.enum(["ok", "empty_but_recording", "no_capture_in_range", "not_recording"]),
  snippets: z
    .array(
      z.object({
        text: z.string().max(10_000),
        app_name: z.string().max(200).default(""),
        window_name: z.string().max(500).nullish(),
      }),
    )
    .max(100)
    .default([]),
});

/** `/health` is read for `status` only: the rest of it holds the machine's hostname. */
export const healthSchema = z.object({ status: z.string() });
