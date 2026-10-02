import { ActionCard } from "@/components/today/ActionCard";
import { BriefingText } from "@/components/today/BriefingText";
import { NoteCard } from "@/components/today/note/NoteCard";
import { VerdictTable } from "@/components/today/VerdictTable";
import { WHO_PHRASE } from "@/lib/explain/actions";
import type { Product } from "@/lib/products/catalog";
import { Example } from "./Example";
import { EXAMPLE_NOTES } from "./note-example-data";
import { exampleToday } from "./today-example-data";

/** Fictional Today pieces: the briefing, the verdict table and a card for each "who's on it". */
export function TodayExamples({ product }: { product: Pick<Product, "id" | "name"> }) {
  const today = exampleToday(product);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">Illustrative briefing, verdicts and actions.</p>
      {EXAMPLE_NOTES.map(({ label, slot, buttonState }) => (
        <Example key={label} label={label}>
          <NoteCard slot={slot} timeZone="UTC" locale="en-GB" demo demoState={buttonState} />
        </Example>
      ))}
      <Example label="Briefing">
        <BriefingText briefing={today.briefing} isSample={false} level={3} />
      </Example>
      <Example label="Briefing · sample data">
        <BriefingText briefing={today.briefing} isSample level={3} />
      </Example>
      <Example label="Scores by product · a partial score and a gap">
        <VerdictTable scores={today.scores} />
      </Example>
      {today.actions.map((action) => (
        <Example
          key={action.id}
          label={`Next up · ${action.who ? WHO_PHRASE[action.who] : "no one on it"}`}
        >
          <ActionCard action={action} />
        </Example>
      ))}
    </div>
  );
}
