import { idea, piece, view } from "@/components/content/content-fixtures";
import { Gaps } from "@/components/content/Gaps";
import { IdeaCard } from "@/components/content/IdeaCard";
import { PieceView } from "@/components/content/PieceView";
import { Example } from "./Example";

/** Every state of the Content page's components, from fictional data. */
export function ContentExamples() {
  const x = {
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
        <IdeaCard idea={idea()} />
      </Example>
      <Example label="A ready piece with a flag to check">
        <PieceView
          piece={piece({
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
            tab: "needs-you",
            needsYou: "Two claims don't trace to your notes. Check them or remove them.",
          })}
        />
      </Example>
      <Example label="A step that didn't finish">
        <IdeaCard idea={idea({ retry: true, note: "The draft didn't finish. Try again." })} />
      </Example>
      <Example label="A piece that wasn't written">
        <PieceView
          piece={piece({
            empty: true,
            copy: [],
            needsYou: "This piece wasn't written. Try again.",
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
