import { ProposalItem } from "@/components/proposals/ProposalItem";
import { ProposalList } from "@/components/proposals/ProposalList";
import { ProposalValue } from "@/components/proposals/ProposalValue";
import type { ProposalRow } from "@/lib/agents/proposals";
import { Example } from "./Example";

const row = (over: Partial<ProposalRow>): ProposalRow => ({
  id: 1,
  productId: "acme-docs",
  type: "keyword",
  value: { term: "example widgets", intent: "commercial", location: "Springfield" },
  key: "example",
  why: "People comparing options search this.",
  status: "proposed",
  edited: false,
  sourceJobId: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  decidedAt: null,
  ...over,
});

const ITEMS: ProposalRow[] = [
  row({ id: 1 }),
  row({
    id: 2,
    value: { term: "how do example widgets work", intent: "informational" },
    status: "approved",
  }),
  row({
    id: 3,
    value: { term: "acme docs", intent: "navigational" },
    status: "rejected",
    edited: true,
  }),
  row({
    id: 4,
    type: "competitor",
    value: { name: "Example Rival", url: "https://rival.example.com" },
    why: "Shows up beside you in searches.",
  }),
];

/** Fictional proposal states: a full list, an empty list, and each kind of value and status. */
export function ProposalExamples() {
  return (
    <div className="flex flex-col gap-6">
      <Example label="Proposal list with every status">
        <ProposalList type="keyword" productId="acme-docs" productName="Acme Docs" items={ITEMS} />
      </Example>
      <Example label="Empty proposal list">
        <ProposalList type="keyword" productId="acme-docs" productName="Acme Docs" items={[]} />
      </Example>
      <Example label="One proposal waiting for approval">
        <ul>
          <ProposalItem
            productId="acme-docs"
            item={row({ id: 5, value: { term: "example gadgets", intent: "local" } })}
          />
        </ul>
      </Example>
      <Example label="Proposal values by type">
        <div className="flex flex-col gap-2">
          <ProposalValue item={ITEMS[0] ?? row({})} />
          <ProposalValue item={row({ type: "question", value: { text: "Is it free?" } })} />
          <ProposalValue
            item={row({
              type: "pillar",
              value: { key: "guides", name: "Guides", description: "How-to articles." },
            })}
          />
          <ProposalValue item={ITEMS[3] ?? row({})} />
        </div>
      </Example>
    </div>
  );
}
