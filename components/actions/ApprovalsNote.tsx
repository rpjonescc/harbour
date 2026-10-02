import Link from "next/link";
import { approvalsPhrase } from "@/lib/explain/approvals";

/**
 * Research targets the agents proposed are approved on each product's settings page; the
 * board only points there.
 */
export function ApprovalsNote({
  waiting,
}: {
  waiting: { productId: string; productName: string; count: number }[];
}) {
  if (waiting.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {waiting.map(({ productId, productName, count }) => (
        <li key={productId}>
          <Link
            href={`/settings/products/${productId}`}
            className="rounded-sm text-accent underline underline-offset-2"
          >
            {productName}: {approvalsPhrase(count)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
