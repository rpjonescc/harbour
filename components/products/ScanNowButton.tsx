"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

type Active = "queued" | "running" | null;

/**
 * Queues a scan of the product; disabled while one is queued or running (the page's scan
 * status says so, so the button's own note clears).
 */
export function ScanNowButton({ productId, active }: { productId: string; active: Active }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function scan() {
    setBusy(true);
    setNote("");
    const result = await postJson<{ jobId: number; created: boolean }>("/api/scans", { productId });
    setBusy(false);
    if (!result.ok) return setNote("Couldn't queue the scan — try again.");
    setNote(result.data.created ? "Scan queued" : "A scan is already queued");
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
