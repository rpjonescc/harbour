type Props = {
  /** What will appear here. */
  what: string;
  /** When it will appear. */
  when: string;
  /** Why it is empty, or why it matters. */
  why: string;
};

/** An empty place that says what will appear, when and why: never a bare "nothing here". */
export function EmptyState({ what, when, why }: Props) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-3 text-sm">
      <p className="text-ink">{what}</p>{" "}
      <p className="mt-1 text-ink-muted">
        {when} {why}
      </p>
    </div>
  );
}
