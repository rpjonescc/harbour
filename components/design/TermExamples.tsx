import { PageHeader } from "@/components/explain/PageHeader";
import { Term } from "@/components/explain/Term";
import { Button } from "@/components/ui/Button";
import { Example } from "./Example";

/** Fictional `<Term>` sentences and a page header with "What's this page?". */
export function TermExamples() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">
        Hover, focus, tap or press Enter on an underlined word. Press ? anywhere on this page to
        open its own page help.
      </p>
      <Example label="Term · in a sentence">
        <p className="text-sm">
          Acme Docs has 3 of 53 pages <Term id="indexed">in Google</Term>. The{" "}
          <Term id="worker">worker</Term> runs the next <Term id="check">check</Term> at 06:00.
        </p>
      </Example>
      <Example label="Term · with a More link">
        <p className="text-sm">
          The last <Term id="backup">backup</Term> finished at 03:20. This month stays within the{" "}
          <Term id="budget">budget</Term>.
        </p>
      </Example>
      <Example label="Term · in a heading">
        <p className="font-serif text-xl">
          2 <Term id="draft">drafts</Term> ready for you
        </p>
      </Example>
      <Example label="Page header · with What's this page? and a control">
        <PageHeader
          title="Acme Docs"
          intro="https://docs.example.com"
          page="product"
          titleLevel={2}
        >
          <Button variant="ghost">Check now</Button>
        </PageHeader>
      </Example>
    </div>
  );
}
