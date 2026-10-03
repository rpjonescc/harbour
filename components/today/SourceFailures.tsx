import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import {
  SOURCE_TROUBLE_LINK,
  SOURCE_TROUBLE_NOTE,
  sourceName,
  sourceTrouble,
} from "@/lib/explain/sources";
import { productById } from "@/lib/products/catalog";
import type { SourceFailure } from "@/lib/today/types";

const keyOf = (f: SourceFailure) => `${f.productId}:${f.collector}`;

/** Data sources that failed in a product's last check: what happened, does it matter, what to do. */
export function SourceFailures({ failures }: { failures: SourceFailure[] }) {
  const heading = sourceTrouble(failures);
  if (heading === null) return null;
  return (
    <section
      aria-labelledby="failures-heading"
      className="flex flex-col gap-1 rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink"
    >
      <h3 id="failures-heading" className="font-medium">
        {heading}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {failures.map((f) => (
          <li key={keyOf(f)}>
            {sourceName(f.collector)} · {productById(f.productId).name}
          </li>
        ))}
      </ul>
      <p>
        {SOURCE_TROUBLE_NOTE}{" "}
        <Link href="/settings/sources" className="rounded-sm text-accent hover:underline">
          {SOURCE_TROUBLE_LINK}
        </Link>
        .
      </p>
      <TechnicalDetails id="today-source-failures" topic="data source errors">
        <ul className="flex flex-col gap-0.5 font-mono">
          {failures.map((f) => (
            <li key={keyOf(f)}>
              {f.collector} · {f.productId}: {f.error ?? "no error recorded"}
            </li>
          ))}
        </ul>
      </TechnicalDetails>
    </section>
  );
}
