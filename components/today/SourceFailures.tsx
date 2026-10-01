import Link from "next/link";
import { getProducts } from "@/lib/products/catalog";
import { collectorLabel } from "@/lib/scan/labels";
import type { SourceFailure } from "@/lib/today/types";

/** Sources that failed in each product's last scan; scores they feed are incomplete. */
export function SourceFailures({ failures }: { failures: SourceFailure[] }) {
  if (failures.length === 0) return null;
  const nameOf = (id: string) => getProducts().find((p) => p.id === id)?.name ?? id;
  return (
    <section
      aria-labelledby="failures-heading"
      className="rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink"
    >
      <h2 id="failures-heading" className="font-medium">
        {failures.length === 1 ? "A source failed" : `${failures.length} sources failed`} in the
        last scan
      </h2>
      <ul className="mt-1 flex flex-col gap-0.5">
        {failures.map((f) => (
          <li key={`${f.productId}:${f.collector}`}>
            {collectorLabel(f.collector)} · {nameOf(f.productId)}
            {f.error && <span className="text-ink-muted"> — {f.error}</span>}
          </li>
        ))}
      </ul>
      <Link href="/settings/sources" className="mt-1 inline-block text-accent hover:underline">
        Check sources
      </Link>
    </section>
  );
}
