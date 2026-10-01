"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import { postJson } from "@/lib/auth/client-api";

type RunRequest = { kind: "research"; topic: string } | { kind: "discovery"; productId: string };

function TokenNotice() {
  return (
    <div role="note" className="rounded-sm bg-warn-soft px-3 py-2 text-sm text-ink">
      Agents need a Claude token. Run <code className="font-mono">claude setup-token</code> on the
      Harbour PC, add <code className="font-mono">HARBOUR_CLAUDE_OAUTH_TOKEN=…</code> to{" "}
      <code className="font-mono">.env</code>, then restart the worker.
    </div>
  );
}

/** Buttons that queue research and discovery runs. */
export function RunPanel({
  products,
  tokenSet,
}: {
  products: { id: string; name: string }[];
  tokenSet: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function start(request: RunRequest) {
    setBusy(true);
    setError(null);
    setNotice("");
    const result = await postJson<{ jobIds: number[] }>("/api/agents/run", request);
    setBusy(false);
    if (!result.ok) return setError("Couldn't queue that run. Try again.");
    const { jobIds } = result.data;
    const [first] = jobIds;
    if (first === undefined) return setError("Nothing was queued. Try again.");
    if (request.kind === "research" && request.topic === "all") {
      setNotice(`Queued ${jobIds.length} research ${jobIds.length === 1 ? "run" : "runs"}`);
      return router.refresh();
    }
    router.push(`/agents/${first}`);
  }
  const disabled = busy || !tokenSet;

  return (
    <div className="flex flex-col gap-4">
      {!tokenSet && <TokenNotice />}
      <Panel className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl">Research</h2>
          <Button onClick={() => start({ kind: "research", topic: "all" })} disabled={disabled}>
            Run all research topics
          </Button>
        </div>
        <ul className="divide-y divide-line">
          {RESEARCH_TOPICS.map((topic) => (
            <li key={topic.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">{topic.title}</span>
              <Button
                variant="ghost"
                onClick={() => start({ kind: "research", topic: topic.id })}
                disabled={disabled}
                aria-label={`Run research: ${topic.title}`}
              >
                Run
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="flex flex-col gap-3 p-4">
        <h2 className="font-serif text-xl">Discovery</h2>
        <ul className="divide-y divide-line">
          {products.map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">{product.name}</span>
              <Button
                variant="ghost"
                onClick={() => start({ kind: "discovery", productId: product.id })}
                disabled={disabled}
                aria-label={`Run discovery: ${product.name}`}
              >
                Run discovery
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
      <p aria-live="polite" className="text-sm text-ink-muted">
        {notice}
      </p>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
