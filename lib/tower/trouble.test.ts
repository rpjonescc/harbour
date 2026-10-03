import type { LightId, LightTone } from "@/lib/explain/tower";
import type { Light } from "./system";
import { troubleLights } from "./trouble";

const IDS: LightId[] = [
  "website",
  "worker",
  "schedules",
  "checks",
  "backups",
  "sources",
  "agents",
  "spend",
];
const lights = (tones: LightTone[]): Light[] =>
  IDS.map((id, i) => ({ id, tone: tones[i] ?? "ok", sentence: `${id}.`, href: null }));

describe("troubleLights", () => {
  it("has nothing to say when every light is fine, working or off on purpose", () => {
    expect(troubleLights(lights(["ok", "busy", "off"]))).toEqual({ shown: [], more: 0 });
  });

  it("lists act, then watch, then can't-tell, keeping the fixed order within a tone", () => {
    const { shown } = troubleLights(
      lights(["ok", "unknown", "watch", "act", "watch", "ok", "act", "ok"]),
    );
    expect(shown.map((l) => l.id)).toEqual(["checks", "agents", "schedules", "backups", "worker"]);
  });

  it("stops at five and counts the rest", () => {
    const { shown, more } = troubleLights(lights(Array(8).fill("watch")));
    expect(shown).toHaveLength(5);
    expect(more).toBe(3);
  });
});
