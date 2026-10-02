"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { postJson } from "@/lib/auth/client-api";
import { refusalMessage } from "@/lib/explain/content";
import { isStalled, joinSavingPoll, subscribeStalled } from "./savingPoller";

/**
 * Sends one decision to /api/content (it only queues work for the worker) and says calmly why
 * when it is refused. While a decision is waiting the page is refreshed by one shared poller
 * (2 s, backing off to 15 s, with a bound), and nothing else on it changes.
 */
export function useContentDecision(saving: boolean) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Held in a ref: joining again on every render would restart the back-off.
  const refresh = useRef(() => router.refresh());
  refresh.current = () => router.refresh();
  useEffect(() => (saving ? joinSavingPoll(() => refresh.current()) : undefined), [saving]);
  const stalled = useSyncExternalStore(subscribeStalled, isStalled, () => false);

  async function send(body: Record<string, unknown>, onSent: () => void) {
    setBusy(true);
    setError("");
    const result = await postJson<{ jobIds: number[] }>("/api/content", body);
    setBusy(false);
    if (!result.ok) return setError(refusalMessage(result.error, result.message));
    onSent();
    router.refresh();
  }
  return { busy, error, clearError: () => setError(""), send, stalled: saving && stalled };
}
