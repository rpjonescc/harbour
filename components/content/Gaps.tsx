import { EmptyState } from "@/components/explain/EmptyState";
import type { ContentView } from "@/lib/content/read/view-types";
import { notesMissingMessage } from "@/lib/explain/content";

/** The calm gap states (fixed wording, spec §10.1). */
export function Gaps({ view, template }: { view: ContentView; template: string | null }) {
  const unusable = view.voice.filter((v) => v.state !== "ok");
  return (
    <div className="flex flex-col gap-3">
      {!view.tokenSet && (
        <p className="text-sm text-ink-muted">
          Harbour isn't connected to Claude yet, so it can't write. Settings shows what to add.
        </p>
      )}
      {view.digest.gap && (
        <p className="text-sm text-ink-muted">
          Ideas this week come from your notes only. Screenpipe wasn't reachable.
        </p>
      )}
      {unusable.map((v) => (
        <EmptyState
          key={v.productId}
          what={`Write a voice profile for ${v.name} so drafts sound like it.`}
          when={
            v.state === "invalid"
              ? (v.reason ?? "The profile couldn't be read.")
              : "It takes a few minutes."
          }
          why="Save it in your Second Brain under content/voices. The template is below."
        />
      ))}
      {view.voice
        .filter((v) => v.notesMissing)
        .map((v) => (
          <p key={v.productId} className="text-sm text-ink-muted">
            {notesMissingMessage(v.name, v.productId)}
          </p>
        ))}
      {unusable.length > 0 && (
        <details className="text-sm">
          <summary className="w-fit cursor-pointer rounded-sm text-ink-muted hover:text-ink">
            The voice profile template
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-sm border border-line bg-surface-sunk p-3 text-xs">
            {template ??
              "The template is in skills/atomizer/voice-profile.md in the Harbour repository."}
          </pre>
        </details>
      )}
    </div>
  );
}
