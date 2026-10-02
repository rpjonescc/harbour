"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DEMO_NOTE } from "@/components/ui/demo-note";
import { postJson } from "@/lib/auth/client-api";
import { SCAN_NOW } from "@/lib/explain/scan-status";

type Active = "queued" | "running" | null;

/**
 * Queues a scan of the product; disabled while one is queued or running (the page's scan
 * status says so, so the button's own note clears).
 */
export function ScanNowButton({
  productId,
  active,
  demo = false,
}: {
  productId: string;
  active: Active;
  /** /design example: never queues anything. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function scan() {
    setNote("");
    if (demo) return setNote(DEMO_NOTE);
    setBusy(true);
    const result = await postJson<{ jobId: number; created: boolean }>("/api/scans", { productId });
    setBusy(false);
    if (!result.ok) return setNote(SCAN_NOW.failed);
    setNote(result.data.created ? SCAN_NOW.queued : SCAN_NOW.already);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <p role="status" className="text-xs text-ink-muted">
        {active ? "" : note}
      </p>
      <Button onClick={scan} disabled={busy || active !== null}>
        Scan now
      </Button>
    </div>
  );
}
