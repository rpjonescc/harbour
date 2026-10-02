import { idea, piece, view } from "@/components/content/content-fixtures";
import { Gaps } from "@/components/content/Gaps";
import { IdeaCard } from "@/components/content/IdeaCard";
import { PieceView } from "@/components/content/PieceView";
import { Example } from "./Example";

/** Every state of the Content page's components, from fictional data. */
export function ContentExamples() {
  const x = {
    id: "acme-docs-20261002-ex-thread.x",
    title: "Thread example",
    platform: "x" as const,
    platformName: "X",
    text: "1/2 First point.\n\n2/2 Second point.",
    copy: [
      { label: "Post 1", text: "First point." },
      { label: "Post 2", text: "Second point." },
    ],
  };
  return (
    <div className="flex flex-col gap-6">
      <Example label="Idea card">
        <IdeaCard
          idea={idea({ id: "acme-docs-20261002-ex-idea", title: "Five minutes to a first deploy" })}
        />
      </Example>
      <Example label="A ready piece with a flag to check">
        <PieceView
          piece={piece({
            id: "acme-docs-20261002-ex-flag.linkedin",
            title: "Flag example",
            flags: ["pricing"],
            flagLines: ["Check before posting: 1 pricing claim"],
          })}
        />
      </Example>
      <Example label="An X thread, each post copied on its own">
        <PieceView piece={piece(x)} />
      </Example>
      <Example label="A piece that needs you">
        <PieceView
          piece={piece({
            id: "acme-docs-20261002-ex-needs.linkedin",
            title: "Needs you example",
            tab: "needs-you",
            needsYou: "Two claims don't trace to your notes. Check them or remove them.",
          })}
        />
      </Example>
      <Example label="A step that didn't finish">
        <IdeaCard
          idea={idea({
            id: "acme-docs-20261002-ex-retry",
            title: "A draft that stopped",
            retry: true,
            note: "The draft didn't finish. Try again.",
          })}
        />
      </Example>
      <Example label="A piece that wasn't written (Discard arrives with the decision buttons)">
        <PieceView
          piece={piece({
            id: "acme-docs-20261002-ex-stub.website",
            title: "Stub example",
            platform: "website",
            platformName: "Website section",
            empty: true,
            copy: [],
            needsYou: "This piece wasn't written. Discard this idea and write it again.",
          })}
        />
      </Example>
      <Example label="No voice profile, and no recent digest">
        <Gaps
          view={view({
            digest: { gap: true },
            voice: [{ productId: "acme-docs", name: "Acme Docs", state: "missing" }],
          })}
          template={null}
        />
      </Example>
    </div>
  );
}
