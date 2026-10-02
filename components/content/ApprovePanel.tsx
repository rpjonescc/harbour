import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PieceView } from "@/lib/content/read/view-types";
import type { Flag } from "@/lib/content/schema";

/** Approve: every flag ticked, and for a Needs you piece a second confirmation naming what is open. */
export function ApprovePanel({
  piece,
  busy,
  onConfirm,
  onCancel,
}: {
  piece: PieceView;
  busy: boolean;
  onConfirm: (checked: Flag[], confirmOpen: boolean) => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState<Flag[]>([]);
  const open = piece.tab === "needs-you";
  const toggle = (flag: Flag, on: boolean) =>
    setChecked(on ? [...checked, flag] : checked.filter((f) => f !== flag));
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-line p-3 text-sm">
      {open && <p>Approve anyway? {piece.needsYou}</p>}
      {piece.flags.map((flag) => (
        <label key={flag} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={checked.includes(flag)}
            onChange={(event) => toggle(flag, event.target.checked)}
          />
          I've checked the {flag} claim
        </label>
      ))}
      <div className="flex gap-2">
        <Button
          disabled={busy || piece.flags.some((flag) => !checked.includes(flag))}
          onClick={() => onConfirm(checked, open)}
        >
          Confirm approval
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
