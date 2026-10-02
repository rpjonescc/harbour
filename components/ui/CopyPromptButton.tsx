"use client";

import { ClipboardCopy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * "Hand to Claude": copies a ready-made prompt for one issue or action. If the clipboard is refused
 * (e.g. an insecure context), the prompt is shown to copy by hand instead.
 */
export function CopyPromptButton({ prompt, title }: { prompt: string; title: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    // Clear first, so a repeat copy changes the live region and is announced again.
    setState("idle");
    try {
      await navigator.clipboard.writeText(prompt);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={copy} aria-label={`Hand to Claude: ${title}`}>
          <ClipboardCopy aria-hidden="true" className="size-3.5" />
          Hand to Claude
        </Button>
        <p role="status" className="text-xs text-ink-muted">
          {state === "copied" && "Copied — paste it into Claude"}
          {state === "failed" && "Couldn't copy — select the prompt below instead."}
        </p>
      </div>
      {state === "failed" && (
        <textarea
          readOnly
          aria-label={`Prompt for Claude: ${title}`}
          value={prompt}
          rows={8}
          className="w-full rounded-sm border border-line bg-surface-sunk p-2 font-mono text-xs text-ink"
        />
      )}
    </div>
  );
}
