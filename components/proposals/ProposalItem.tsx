"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import type { ProposalRow } from "@/lib/agents/proposals";
import { postJson } from "@/lib/auth/client-api";
import { cleanValue, FIELDS, proposalLabel } from "./proposal-fields";

const INPUT = "w-full rounded-sm border border-line bg-surface px-2 py-1 text-sm";

function StatusTag({ status }: { status: string }) {
  const tone = status === "proposed" ? "warn" : status === "approved" ? "accent" : "neutral";
  return <Tag tone={tone}>{status}</Tag>;
}

function ValueView({ item }: { item: ProposalRow }) {
  const v = item.value;
  if (item.type === "keyword") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{v.term}</span>
        {v.intent && <Tag tone="neutral">{v.intent}</Tag>}
        {v.location && <span className="text-ink-muted">{v.location}</span>}
      </p>
    );
  }
  if (item.type === "question") return <p className="text-sm font-medium">{v.text}</p>;
  const url = v.url ?? "";
  const safe = /^https?:\/\//i.test(url);
  return (
    <p className="text-sm">
      <span className="font-medium">{v.name}</span>{" "}
      {safe ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2"
        >
          {url}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span className="text-ink-muted">{url}</span>
      )}
    </p>
  );
}

/** One proposal row with approve / reject / edit controls. */
export function ProposalItem({
  productId,
  item,
  onResult,
}: {
  productId: string;
  item: ProposalRow;
  onResult?: (message: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(item.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = proposalLabel(item.type, item.value);
  const editButton = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) firstField.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  function startEditing() {
    setDraft(item.value);
    setError(null);
    setEditing(true);
  }

  async function send(body: unknown, failure: string, success: string) {
    setBusy(true);
    setError(null);
    const result = await postJson<{ ok: true }>(`/api/products/${productId}/proposals`, body);
    setBusy(false);
    if (!result.ok) {
      return setError(result.error === "invalid_edit" && result.message ? result.message : failure);
    }
    setEditing(false);
    onResult?.(success);
    router.refresh();
  }

  const decide = (action: "approve" | "reject") => {
    const alreadyDone = item.status === (action === "approve" ? "approved" : "rejected");
    if (busy || alreadyDone) return;
    void send(
      { action, proposalId: item.id },
      `Couldn't ${action}. Try again.`,
      `${action === "approve" ? "Approved" : "Rejected"} ${label}`,
    );
  };

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ValueView item={item} />
          <p className="mt-0.5 text-sm text-ink-muted">{item.why}</p>
        </div>
        <div className="flex items-center gap-2">
          {item.edited && <Tag tone="neutral">edited</Tag>}
          <StatusTag status={item.status} />
        </div>
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(
              { action: "edit", proposalId: item.id, value: cleanValue(item.type, draft) },
              "Couldn't save. Try again.",
              `Saved ${label}`,
            );
          }}
        >
          {FIELDS[item.type].map((field, index) => (
            <div key={field.name} className="flex flex-col gap-1 text-sm">
              <label htmlFor={`p${item.id}-${field.name}`} className="text-ink-muted">
                {field.label}
              </label>
              {field.choices ? (
                <select
                  ref={index === 0 ? firstField : undefined}
                  id={`p${item.id}-${field.name}`}
                  className={INPUT}
                  value={draft[field.name] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [field.name]: e.target.value })}
                >
                  {field.choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={index === 0 ? firstField : undefined}
                  id={`p${item.id}-${field.name}`}
                  className={INPUT}
                  value={draft[field.name] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [field.name]: e.target.value })}
                />
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} aria-label={`Save ${label}`}>
              Save
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setDraft(item.value);
                setError(null);
              }}
              aria-label={`Cancel editing ${label}`}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            aria-disabled={busy || item.status === "approved"}
            onClick={() => decide("approve")}
            aria-label={`Approve ${label}`}
            className="aria-disabled:opacity-50"
          >
            Approve
          </Button>
          <Button
            variant="ghost"
            aria-disabled={busy || item.status === "rejected"}
            onClick={() => decide("reject")}
            aria-label={`Reject ${label}`}
            className="aria-disabled:opacity-50"
          >
            Reject
          </Button>
          {item.status !== "rejected" && (
            <Button
              ref={editButton}
              variant="ghost"
              disabled={busy}
              onClick={startEditing}
              aria-label={`Edit ${label}`}
            >
              Edit
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="whitespace-pre-line text-sm text-bad">
          {error}
        </p>
      )}
    </li>
  );
}
