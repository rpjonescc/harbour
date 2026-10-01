import type { ReactNode } from "react";
import { BrainExamples } from "@/components/design/BrainExamples";
import { TokenSwatches } from "@/components/design/TokenSwatches";
import { Button } from "@/components/ui/Button";
import { Delta } from "@/components/ui/Delta";
import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { Sparkline } from "@/components/ui/Sparkline";
import { Tag } from "@/components/ui/Tag";
import { requireSession } from "@/lib/auth/guard";
import { getProducts } from "@/lib/products/catalog";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-xl">{title}</h2>
      <Panel className="p-5">{children}</Panel>
    </section>
  );
}

export default async function DesignPage() {
  // Layouts do not re-run on client navigation, so every page checks the session itself.
  await requireSession();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="font-serif text-3xl">Design system</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Paper &amp; Tide. Edit values in design/tokens.css.
        </p>
      </header>
      <Section title="Colour tokens">
        <TokenSwatches />
      </Section>
      <Section title="Elevation">
        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className="size-16 shrink-0 rounded-lg border border-line bg-surface shadow-overlay"
          />
          <p className="text-sm">
            <code className="font-mono text-xs">--elevation-overlay</code>
            <span className="block text-xs text-ink-muted">
              Floating layers such as the search dialog (Tailwind: shadow-overlay)
            </span>
          </p>
        </div>
      </Section>
      <Section title="Type">
        <p className="font-serif text-3xl">Newsreader — headings and reading</p>
        <p className="mt-2 text-sm">Inter — interface text, labels and tables.</p>
        <p className="mt-2 font-mono text-xs">JetBrains Mono — code and identifiers</p>
      </Section>
      <Section title="Components">
        <div className="flex flex-wrap items-center gap-4">
          <Button>Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Tag>Accent</Tag>
          <Tag tone="warn">Warn</Tag>
          <Tag tone="neutral">Neutral</Tag>
          {getProducts().map((product) => (
            <span key={product.id} className="inline-flex items-center gap-2 text-sm">
              <ProductDot product={product} />
              {product.name}
            </span>
          ))}
          <span className="text-sm tabular-nums">
            62
            <Delta value={3} />
          </span>
          <span className="text-sm tabular-nums">
            9<Delta value={-2} />
          </span>
          <Sparkline values={[10, 14, 12, 18, 21, 25]} label="Example rising trend" />
        </div>
      </Section>
      <Section title="Second Brain examples">
        <BrainExamples />
      </Section>
    </div>
  );
}
