import { Explainer } from "@/components/explain/Explainer";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { AREA_ORDER, AREAS } from "@/lib/explain/areas";
import type { ProductScores } from "@/lib/today/types";
import { ScoreTable } from "./ScoreTable";
import { VerdictTable } from "./VerdictTable";

/** Today's scores: plain verdicts first, what each area means, and the numbers one click away. */
export function ScoresSection({ scores }: { scores: ProductScores[] }) {
  return (
    <section aria-labelledby="scores-heading" className="flex flex-col gap-4">
      <h2 id="scores-heading" className="font-serif text-xl">
        How your sites are doing
      </h2>
      <VerdictTable scores={scores} />
      <ul aria-label="What the columns mean" className="flex flex-col gap-3">
        {AREA_ORDER.map((key) => {
          const area = AREAS[key];
          return (
            <li key={key} className="flex flex-col gap-1">
              <p className="text-sm font-medium">{area.name}</p>
              <Explainer
                topic={area.name}
                oneLiner={area.oneLiner}
                parts={area.parts}
                nextStep={{
                  href: `/actions?area=${area.code}`,
                  label: `See ideas for ${area.name}`,
                }}
              />
            </li>
          );
        })}
      </ul>
      <TechnicalDetails id="today-scores" topic="scores in numbers">
        <ScoreTable scores={scores} />
      </TechnicalDetails>
    </section>
  );
}
