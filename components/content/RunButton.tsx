"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";
import { refusalMessage } from "@/lib/explain/content";

/** Posts one request to /api/content and says calmly what happened (it only queues work). */
export function RunButton({
  label,
  body,
  doneText,
}: {
  label: string;
  body: Record<string, unknown>;
  doneText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run() {
    setBusy(true);
    setMessage("");
    const result = await postJson<{ jobIds: number[] }>("/api/content", body);
    setBusy(false);
    setMessage(result.ok ? doneText : refusalMessage(result.error, result.message));
    if (result.ok) router.refresh();
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="ghost" onClick={run} disabled={busy}>
        {label}
      </Button>
      <span role="status" className="text-xs text-ink-muted">
        {message}
      </span>
    </span>
  );
}
