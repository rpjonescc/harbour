import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PieceView } from "@/lib/content/read/view-types";

/** Edit the piece's one text field; the skills are not re-run on the owner's own words. */
export function EditPanel({
  piece,
  busy,
  onSave,
  onCancel,
}: {
  piece: PieceView;
  busy: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(piece.editText);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Edit the piece text"
        className="w-full rounded-sm border border-line bg-surface px-2 py-1 text-sm"
        rows={8}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {piece.platform === "x" && (
        <p className="text-xs text-ink-muted">Separate posts with a line holding -- next post --</p>
      )}
      <p className="text-xs text-ink-muted">
        Harbour checks the numbers and the platform's limits again, not the writing.
      </p>
      <div className="flex gap-2">
        <Button disabled={busy || text.trim() === ""} onClick={() => onSave(text)}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
