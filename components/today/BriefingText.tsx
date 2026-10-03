import { Tag } from "@/components/ui/Tag";
import type { Briefing } from "@/lib/explain/briefing";

type Props = {
  briefing: Briefing;
  /** Sample data gets a tag above the sentence, so it is never mistaken for real results. */
  isSample: boolean;
  /** 1 on Today; 3 when nested under a section heading (the /design examples); "lead" for a
   * paragraph that leads a section whose heading is already set ("Your products"). */
  level?: 1 | 3 | "lead";
};

/** Today's briefing: one plain sentence, and the counts under it. */
export function BriefingText({ briefing, isSample, level = 1 }: Props) {
  const Heading = level === 1 ? "h1" : level === 3 ? "h3" : "p";
  const size = level === 1 ? "text-3xl" : "text-xl";
  return (
    <div className="flex flex-col gap-2">
      {isSample && (
        <p>
          <Tag tone="warn">Sample</Tag>
        </p>
      )}
      <Heading className={`font-serif leading-tight ${size}`}>{briefing.sentence}</Heading>
      <p className="text-sm text-ink-muted">{briefing.subLine}</p>
    </div>
  );
}
