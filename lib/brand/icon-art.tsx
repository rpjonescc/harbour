import { BRAND } from "@/design/brand";

/** The Harbour mark: a serif H on tide green; inset adds a maskable safe zone. */
export function HarbourMark({ size, inset }: { size: number; inset: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.theme,
        color: BRAND.ink,
        fontSize: size * (0.62 - inset),
        fontFamily: "serif",
        borderRadius: inset > 0 ? 0 : size * 0.2,
      }}
    >
      H
    </div>
  );
}
