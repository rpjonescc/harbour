"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

/** Asks the server to rebuild the search index; reports whether it started. */
export function ReindexButton() {
  const [state, setState] = useState<"idle" | "busy" | "started" | "running" | "failed">("idle");
  async function reindex() {
    setState("busy");
    const result = await postJson<{ started: boolean }>("/api/brain/reindex");
    if (!result.ok) return setState("failed");
    setState(result.data.started ? "started" : "running");
  }
  const label = {
    idle: "Reindex",
    busy: "Reindexing…",
    started: "Reindex started",
    running: "Already reindexing",
    failed: "Reindex failed — retry",
  }[state];
  return (
    <Button variant="ghost" onClick={reindex} disabled={state === "busy"}>
      <span aria-live="polite">{label}</span>
    </Button>
  );
}
