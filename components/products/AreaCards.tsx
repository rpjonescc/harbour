import { Explainer } from "@/components/explain/Explainer";
import { VerdictLine } from "@/components/explain/VerdictLine";
import { AREA_ORDER, AREAS, areaNextStep } from "@/lib/explain/areas";
import { gapReason } from "@/lib/explain/verdict";
import type { ScanState, ScoreTrend } from "@/lib/scan/views";

/** The three areas in the owner's words: a big verdict first, the number small, "What's this?". */
export function AreaCards({ scores, scan }: { scores: ScoreTrend; scan: ScanState }) {
  const { latest, deltas } = scores;
  const missingReason = gapReason({
    scanned: latest !== null,
    lastCheckFailed: scan.last?.status === "failed",
  });
  return (
    <ul aria-label="Your three scores" className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {AREA_ORDER.map((key) => {
        const area = AREAS[key];
        return (
          <li
            key={key}
            className="flex flex-col gap-4 rounded-md border border-line bg-surface p-5"
          >
            <VerdictLine
              stacked
              area={key}
              score={latest?.totals[key] ?? null}
              delta={deltas[key]}
              complete={latest?.complete[key] ?? true}
              missingReason={missingReason}
            />
            <Explainer
              topic={area.name}
              oneLiner={area.oneLiner}
              parts={area.parts}
              nextStep={areaNextStep(key)}
            />
          </li>
        );
      })}
    </ul>
  );
}
