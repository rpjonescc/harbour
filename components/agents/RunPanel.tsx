"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import { postJson } from "@/lib/auth/client-api";
import { AGENT_PURPOSE } from "@/lib/explain/agents";
import { CLAUDE_CONNECT_STEPS, CLAUDE_OFF } from "@/lib/explain/claude";

type RunRequest = { kind: "research"; topic: string } | { kind: "discovery"; productId: string };

function ClaudeNotice() {
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-sm bg-warn-soft px-3 py-2 text-sm text-ink"
    >
      <p>{CLAUDE_OFF}</p>
      <TechnicalDetails id="claude-setup" topic="how to connect Claude">
        <ol className="list-decimal pl-4">
          {CLAUDE_CONNECT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </TechnicalDetails>
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
    if (!result.ok) return setError("Couldn't start that run. Try again.");
    const { jobIds } = result.data;
    const [first] = jobIds;
    if (first === undefined) return setError("Nothing was started. Try again.");
    if (request.kind === "research" && request.topic === "all") {
      setNotice(`Started ${jobIds.length} research ${jobIds.length === 1 ? "run" : "runs"}`);
      return router.refresh();
    }
    router.push(`/agents/${first}`);
  }
  const disabled = busy || !tokenSet;

  return (
    <div className="flex flex-col gap-4">
      {!tokenSet && <ClaudeNotice />}
      <Panel className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl">Research</h2>
            <p className="text-sm text-ink-muted">{AGENT_PURPOSE.research}</p>
          </div>
          <Button onClick={() => start({ kind: "research", topic: "all" })} disabled={disabled}>
            Run all research
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
        <h2 className="font-serif text-xl">Find ideas</h2>
        <p className="text-sm text-ink-muted">{AGENT_PURPOSE.ideas}</p>
        <ul className="divide-y divide-line">
          {products.map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">{product.name}</span>
              <Button
                variant="ghost"
                onClick={() => start({ kind: "discovery", productId: product.id })}
                disabled={disabled}
                aria-label={`Find ideas for ${product.name}`}
              >
                Find ideas
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
