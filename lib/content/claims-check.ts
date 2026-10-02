import { flagsInText } from "./flag-words";
import { unknownNumbers } from "./numbers";
import { linkProblem } from "./sanitise";
import type { Claim, Finding, Flag } from "./schema";

export type ClaimsInput = {
  text: string;
  sourceText: string;
  factsText: string;
  claims: Claim[];
  paragraphIds: string[];
  factRefs: string[];
  allowedHosts: string[];
};

const FIRST_LINK = /https?:\/\/[^\s)>\]]+|\bwww\.[^\s)>\]]+/i;
const MAX_FINDINGS = 20;
const find = (pattern: string, quote: string, fix: string): Finding => ({
  pattern,
  quote: quote.slice(0, 200),
  fix: fix.slice(0, 200),
});

function linkFindings(text: string, hosts: readonly string[]): Finding[] {
  if (linkProblem(text, hosts) === null) return [];
  const quote = FIRST_LINK.exec(text)?.[0] ?? "";
  return [
    find("Link to another host", quote, "Remove the link or point it at the product's own site"),
  ];
}

function claimFindings(input: ClaimsInput): Finding[] {
  return input.claims.flatMap((claim) => {
    if (claim.trace === "none") {
      return [
        find(
          "Claim with no source",
          claim.text,
          "Remove the claim, or add its source to your notes",
        ),
      ];
    }
    const paragraph = /^source:(p\d+)$/.exec(claim.trace)?.[1];
    if (paragraph) {
      return input.paragraphIds.includes(paragraph)
        ? []
        : [find("Trace to a paragraph that does not exist", claim.text, "Remove the claim")];
    }
    return input.factRefs.includes(claim.trace)
      ? []
      : [find("Trace to a source that does not exist", claim.text, "Remove the claim")];
  });
}

/**
 * The deterministic half of the facts gate (spec §8.3 c): numbers must be in the source piece or
 * the facts pack, links must stay on the product's own host, and every claim needs a trace that
 * exists. Flags come from the claims and the keyword list; they never fail anything.
 */
export function checkClaims(input: ClaimsInput): { findings: Finding[]; flags: Flag[] } {
  const numbers = unknownNumbers(input.text, input.sourceText, input.factsText).map((n) =>
    find("Number not in the source", n, "Remove the number, or add it to your notes first"),
  );
  const findings = [
    ...numbers,
    ...linkFindings(input.text, input.allowedHosts),
    ...claimFindings(input),
  ].slice(0, MAX_FINDINGS);
  const flags = new Set<Flag>([
    ...input.claims.flatMap((c) => (c.flag ? [c.flag] : [])),
    ...flagsInText(input.text),
  ]);
  return { findings, flags: [...flags] };
}
