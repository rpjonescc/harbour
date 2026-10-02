"use client";

import { ClipboardCopy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** Copies clean text (never Harbour's metadata) and says so; says plainly when the clipboard refuses. */
export function CopyButton({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    setState("idle"); // clear first, so a repeat copy is announced again
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="ghost" onClick={copy} aria-label={`Copy ${label}`}>
        <ClipboardCopy aria-hidden="true" className="size-3.5" />
        Copy
      </Button>
      <span role="status" className="text-xs text-ink-muted">
        {state === "copied" && "Copied"}
        {state === "failed" && "Couldn't copy. Select the text and copy it by hand."}
      </span>
    </span>
  );
}
