import type { ProposalType } from "@/lib/agents/proposals";
import { intentLabel } from "@/lib/explain/approvals";

export const INTENTS = ["informational", "commercial", "transactional", "navigational", "local"];

export type FieldSpec = {
  name: string;
  label: string;
  optional?: boolean;
  choices?: string[];
  choiceLabel?: (choice: string) => string;
};

export const FIELDS: Record<ProposalType, FieldSpec[]> = {
  keyword: [
    { name: "term", label: "Search phrase" },
    {
      name: "intent",
      label: "What the searcher wants",
      choices: INTENTS,
      choiceLabel: intentLabel,
    },
    { name: "location", label: "Location", optional: true },
  ],
  question: [{ name: "text", label: "Question" }],
  competitor: [
    { name: "name", label: "Name" },
    { name: "url", label: "Web address" },
  ],
  pillar: [
    { name: "key", label: "Short code" },
    { name: "name", label: "Name" },
    { name: "description", label: "Description" },
  ],
};

/** Short human label for a proposal, used in accessible names. */
export function proposalLabel(type: ProposalType, value: Record<string, string>): string {
  const text = type === "keyword" ? value.term : type === "question" ? value.text : value.name;
  return `${type} "${text ?? ""}"`;
}

/** Drops empty optional fields so the server schema (min length 1) accepts the value. */
export function cleanValue(type: ProposalType, draft: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const field of FIELDS[type]) {
    const v = draft[field.name] ?? "";
    if (v === "" && field.optional) continue;
    out[field.name] = v;
  }
  return out;
}
