import { CANARY, EVASIONS, HOSTILE_SNIPPETS } from "@/tests/fixtures/content/hostile-snippets";
import { filterHits } from "./hits";
import type { RedactRules } from "./redact";
import type { Hit } from "./schema";

const RULES: RedactRules = {
  excludeApps: [],
  terms: ["acme docs", "acme-docs"],
  productHost: "docs.example.com",
  neverMention: ["Project Zephyr"],
};
const hit = (text: string): Hit => ({ text, timestamp: null, app: "", window: "" });
const kept = (text: string) => filterHits([hit(text)], RULES).kept;

// Every evasion of a redaction rule must fail the same way for text hits as for window rows, and
// also when the excerpt window ends in the middle of it.
describe("filterHits: the redaction evasions", () => {
  it.each(EVASIONS)("does not let $label through", ({ text, leak }) => {
    for (const out of kept(text)) expect(out).not.toContain(leak);
  });

  // Not the link case: there the term is real elsewhere in the frame, so what follows is legitimate context.
  const edgeCases = EVASIONS.filter(({ label }) => !label.startsWith("a term only inside a link"));
  it.each(edgeCases)("does not let $label through at the edge of an excerpt", ({ text, leak }) => {
    // The evasion starts 40 to 80 characters after the first term, so the 120-character window
    // ends somewhere inside it.
    for (const lead of [10, 15, 20, 25, 30]) {
      for (const out of kept(`Acme Docs ${"ab ".repeat(lead)}${text}`)) {
        expect(out).not.toContain(leak);
      }
    }
  });

  it("keeps the on-topic words around an evasion, so the filter is not just dropping everything", () => {
    const survivors = EVASIONS.filter(({ text }) => kept(text).length > 0);
    expect(survivors.length).toBeGreaterThan(EVASIONS.length / 2);
  });

  it("redacts the hostile snippets, and keeps the canary excerpt", () => {
    const out = filterHits(
      HOSTILE_SNIPPETS.map((s) => hit(s.text)),
      RULES,
    ).kept.join("\n");
    expect(out).not.toMatch(
      /attacker\.example|sam@example|\+61 491|4111 1111|192\.168|<script|QWxhZGRpbjpvcGVu|@samexample/,
    );
    expect(out).toContain(CANARY);
  });
});
