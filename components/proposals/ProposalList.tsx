"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { ProposalRow, ProposalType } from "@/lib/agents/proposals";
import { postJson } from "@/lib/auth/client-api";
import { approvalFailure } from "@/lib/explain/approvals";
import { ProposalItem } from "./ProposalItem";

/** All proposals of one type for a product, with a bulk approve button. */
export function ProposalList({
  type,
  productId,
  productName,
  items,
}: {
  type: ProposalType;
  productId: string;
  productName: string;
  items: ProposalRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const count = (status: string) => items.filter((i) => i.status === status).length;
  const proposed = count("proposed");

  async function approveAll() {
    setBusy(true);
    setError(null);
    setAnnouncement("");
    const result = await postJson<{ ok: true; count: number }>(
      `/api/products/${productId}/proposals`,
      { action: "approve-all", type },
    );
    setBusy(false);
    if (!result.ok)
      return setError(
        approvalFailure(result.error, result.message ?? "Couldn't approve them all. Try again."),
      );
    const n = result.data.count ?? 0;
    setAnnouncement(`Approved ${n} ${n === 1 ? type : `${type}s`}`);
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <Panel className="p-4 text-sm text-ink-muted">
        No proposals yet — run discovery for {productName} on the{" "}
        <Link href="/agents" className="text-accent underline underline-offset-2">
          Agents page
        </Link>
        .
      </Panel>
    );
  }

  return (
    <Panel className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {proposed} proposed · {count("approved")} approved · {count("rejected")} rejected
        </p>
        {proposed > 0 && (
          <Button variant="ghost" onClick={approveAll} disabled={busy}>
            Approve all proposed
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 whitespace-pre-line text-sm text-bad">
          {error}
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <ul className="mt-2 divide-y divide-line">
        {items.map((item) => (
          <ProposalItem
            key={item.id}
            productId={productId}
            item={item}
            onResult={setAnnouncement}
          />
        ))}
      </ul>
    </Panel>
  );
}
