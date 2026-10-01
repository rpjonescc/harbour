import { Panel } from "@/components/ui/Panel";

const REASONS = {
  missing: "doesn't exist yet",
  "not-directory": "isn't a folder",
  unreadable: "can't be read by Harbour",
} as const;

/** Shown instead of the viewer when HARBOUR_BRAIN_DIR is not usable. */
export function BrainSetupNotice({ root, reason }: { root: string; reason: keyof typeof REASONS }) {
  return (
    <Panel className="mx-auto max-w-2xl p-6">
      <h1 className="font-serif text-2xl">Set up your Second Brain</h1>
      <p className="mt-3 text-sm">
        Harbour reads Markdown documents from <code className="font-mono">{root}</code>, which{" "}
        {REASONS[reason]}.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        <li>Create a folder for your notes — ideally its own private git repository.</li>
        <li>
          Set <code className="font-mono">HARBOUR_BRAIN_DIR</code> in{" "}
          <code className="font-mono">.env</code> to its path.
        </li>
        <li>Restart Harbour.</li>
      </ol>
    </Panel>
  );
}
