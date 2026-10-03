import { type ReactNode, useId } from "react";
import { SECTION_TITLES } from "@/lib/explain/tower";

export type TowerSectionKey = keyof typeof SECTION_TITLES;

/** Each section's anchor, for the header's "On this page" jump list. */
export const TOWER_ANCHORS: Readonly<Record<TowerSectionKey, string>> = {
  systems: "tower-systems",
  needs: "tower-needs",
  work: "tower-work",
  products: "tower-products",
  activity: "tower-activity",
  wins: "tower-wins",
};

type Props = {
  section: TowerSectionKey;
  /** Overrides the anchor where a tile shows more than once (the /design examples). */
  anchor?: string;
  children: ReactNode;
};

/** A tower section: a region named by its h2, with an anchor the jump list can reach. */
export function TowerSection({ section, anchor = TOWER_ANCHORS[section], children }: Props) {
  const headingId = useId();
  return (
    <section id={anchor} aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-3">
      <h2 id={headingId} className="font-serif text-xl">
        {SECTION_TITLES[section]}
      </h2>
      {children}
    </section>
  );
}
