import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { TILE_FAILED } from "@/lib/explain/tower";

type Props = {
  /** The tile's name as the owner reads it (its section title); names the details. */
  tile: string;
  /** The error, kept behind Technical details. */
  detail: string;
};

/** A tile whose data could not be read: the plain sentence, the error one click away. */
export function TileFailed({ tile, detail }: Props) {
  const id = `tower-${tile.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
      <p className="text-sm text-ink">{TILE_FAILED}</p>
      <TechnicalDetails id={id} topic={tile}>
        <p className="break-words font-mono text-xs text-ink-muted">{detail}</p>
      </TechnicalDetails>
    </div>
  );
}
