"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DEMO_NOTE } from "@/components/ui/demo-note";
import { postJson } from "@/lib/auth/client-api";
import {
  OUTSIDE_CHECK_NOTES,
  OUTSIDE_CHECK_REFUSALS,
  type OutsideRefusal,
} from "@/lib/explain/outside-check";

type Active = "queued" | "running" | null;

const isRefusal = (code: string): code is OutsideRefusal =>
  Object.hasOwn(OUTSIDE_CHECK_REFUSALS, code);

/**
 * Asks the worker for an outside-view check of the product. Disabled while one is on its way. When
 * the page already knows a check would be refused, the reason is shown beside the button but the
 * owner may still try (the server decides, and says why in plain words).
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

  // When the check ends, what the click said ("Checking now") is out of date: the page speaks.
  const was = useRef(active);
  useEffect(() => {
    if (was.current !== null && active === null) setNote("");
    was.current = active;
  }, [active]);

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

  const waiting = note || OUTSIDE_CHECK_NOTES.already;
  const why = active ? waiting : note || (refusal ? OUTSIDE_CHECK_REFUSALS[refusal] : "");
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
