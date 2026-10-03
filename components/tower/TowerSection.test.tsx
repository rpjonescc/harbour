// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { SECTION_TITLES } from "@/lib/explain/tower";
import { TOWER_ANCHORS, TowerSection } from "./TowerSection";

describe("TowerSection", () => {
  it.each(Object.keys(SECTION_TITLES) as (keyof typeof SECTION_TITLES)[])(
    "makes %s a region named by its h2, with its jump-list anchor",
    (section) => {
      render(<TowerSection section={section}>body</TowerSection>);
      const region = screen.getByRole("region", { name: SECTION_TITLES[section] });
      expect(region).toHaveAttribute("id", TOWER_ANCHORS[section]);
      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(SECTION_TITLES[section]);
    },
  );

  it("takes another anchor where a tile shows twice", () => {
    render(
      <TowerSection section="wins" anchor="example-wins">
        body
      </TowerSection>,
    );
    expect(screen.getByRole("region", { name: "Wins this week" })).toHaveAttribute(
      "id",
      "example-wins",
    );
  });
});
