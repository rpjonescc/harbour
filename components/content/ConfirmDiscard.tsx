import { Button } from "@/components/ui/Button";

/** The question before a discard, so no single click destroys anything; Cancel is always there. */
export function ConfirmDiscard({
  question,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  question: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>{question}</span>
      <Button disabled={busy} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
