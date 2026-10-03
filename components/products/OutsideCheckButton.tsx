"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DEMO_NOTE } from "@/components/ui/demo-note";
import { postJson } from "@/lib/auth/client-api";
import {
  OUTSIDE_CHECK_NOTES,
  OUTSIDE_CHECK_REFUSALS,
  type OutsideRefusal,
} from "@/lib/explain/outside-check";

type Active = "queued" | "running" | null;

const isRefusal = (code: string): code is OutsideRefusal => code in OUTSIDE_CHECK_REFUSALS;

/**
 * Asks the worker for an outside-view check of the product. Disabled while one is on its way or
 * when the page already knows it would be refused (the reason is shown beside it); a refusal
 * from the server is shown in plain words too.
 */
export function OutsideCheckButton({
  productId,
  active,
  refusal,
  demo = false,
}: {
  productId: string;
  active: Active;
  /** Why a check can't be started now, or null. */
  refusal: OutsideRefusal | null;
  /** /design example: never queues anything. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function check() {
    setNote("");
    if (demo) return setNote(DEMO_NOTE);
    setBusy(true);
    const result = await postJson<{ jobId: number; created: boolean }>("/api/outside-checks", {
      productId,
    });
    setBusy(false);
    if (!result.ok) {
      return setNote(
        isRefusal(result.error) ? OUTSIDE_CHECK_REFUSALS[result.error] : OUTSIDE_CHECK_NOTES.failed,
      );
    }
    setNote(result.data.created ? OUTSIDE_CHECK_NOTES.queued : OUTSIDE_CHECK_NOTES.already);
    router.refresh();
  }

  const why = active
    ? OUTSIDE_CHECK_NOTES.already
    : note || (refusal ? OUTSIDE_CHECK_REFUSALS[refusal] : "");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={check} disabled={busy || active !== null}>
        Run this check now
      </Button>
      <p role="status" className="text-xs text-ink-muted">
        {why}
      </p>
    </div>
  );
}
