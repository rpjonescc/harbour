import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import type { Note } from "@/lib/explain/voice/note";
import { formatShortDateTime } from "@/lib/format/date";
import type { NoteSlot } from "@/lib/note/view";
import { FreshNoteButton } from "./FreshNoteButton";

function NoteText({ note }: { note: Note }) {
  return (
    <>
      <p className="text-sm text-ink-muted">{note.greeting}</p>
      <p className="font-serif text-xl leading-snug">{note.headline}</p>
      <p>{note.body}</p>
      {note.rest && <p className="text-sm text-ink-muted">{note.rest}</p>}
      {note.picks.length > 0 && (
        <ul aria-label="Worth doing today" className="flex flex-col gap-1 text-sm">
          {note.picks.map((pick) => (
            <li key={pick}>
              <Link href="/actions" className="rounded-sm text-accent hover:underline">
                {pick}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The friend's daily note, above the briefing (spec §4). Plain text only: the note's fields are
 * rendered as text nodes, never as markup. It adds no heading, so the briefing stays the page's h1.
 * A celebrating note carries `data-mood` for the wave's one ripple (CSS only).
 */
export function NoteCard({
  slot,
  timeZone,
  locale,
  demo = false,
}: {
  slot: NoteSlot;
  timeZone: string;
  locale: string;
  demo?: boolean;
}) {
  const { view } = slot;
  const celebrating = view.kind === "note" && view.note.mood === "celebrate";
  return (
    <section
      aria-label="A note from Harbour"
      data-mood={celebrating ? "celebrate" : undefined}
      className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5"
    >
      {view.kind === "sample" && (
        <p>
          <Tag tone="neutral">Sample note</Tag>
        </p>
      )}
      {view.kind === "note" || view.kind === "sample" ? (
        <NoteText note={view.note} />
      ) : (
        <p className="text-sm text-ink-muted">{view.line}</p>
      )}
      {view.kind === "note" && (
        <p className="text-xs text-ink-muted">
          Written {formatShortDateTime(view.at, timeZone, locale)}
        </p>
      )}
      {view.kind !== "sample" && (
        <FreshNoteButton
          latestAt={view.kind === "note" ? view.at.toISOString() : null}
          tokenSet={slot.tokenSet}
          noteTime={slot.noteTime}
          demo={demo}
        />
      )}
    </section>
  );
}
