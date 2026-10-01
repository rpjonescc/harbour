import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalList } from "@/components/proposals/ProposalList";
import { listProposals, type ProposalType } from "@/lib/agents/proposals";
import { requireSession } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { getProducts } from "@/lib/products/catalog";

const SECTIONS: { type: ProposalType; title: string }[] = [
  { type: "keyword", title: "Keywords" },
  { type: "question", title: "AI questions" },
  { type: "competitor", title: "Competitors" },
];

export default async function ProductProposalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const product = getProducts().find((p) => p.id === id);
  if (!product) notFound();
  const proposals = listProposals(getDb(), id);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl">{product.name} — research targets</h1>
        <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-muted">
          {product.url}
          <Link href={`/products/${product.id}`} className="text-accent hover:underline">
            Scores and issues
          </Link>
        </p>
      </header>
      {SECTIONS.map(({ type, title }) => (
        <section key={type} aria-labelledby={`${type}-heading`} className="flex flex-col gap-3">
          <h2 id={`${type}-heading`} className="font-serif text-xl">
            {title}
          </h2>
          <ProposalList
            type={type}
            productId={id}
            productName={product.name}
            items={proposals[type]}
          />
        </section>
      ))}
    </div>
  );
}
