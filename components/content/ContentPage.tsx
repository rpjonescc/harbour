import { EmptyState } from "@/components/explain/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import type { ContentView, TabId } from "@/lib/content/read/view-types";
import { Gaps } from "./Gaps";
import { IdeaCard } from "./IdeaCard";
import { PieceGroup } from "./PieceGroup";
import { RunButton } from "./RunButton";

const IDEA_CARD_TABS: TabId[] = ["ideas", "writing", "discarded"];

function Empty({ view, id }: { view: ContentView; id: TabId }) {
  if (id !== "ideas") return <p className="text-sm text-ink-muted">Nothing here.</p>;
  if (view.voice.every((v) => v.state === "ok")) {
    return <p className="text-sm text-ink-muted">Nothing waiting. Enjoy the quiet.</p>;
  }
  return (
    <EmptyState
      what="No ideas yet."
      when="Ideas arrive on Monday mornings, or ask for some now."
      why="Write a voice profile first."
    />
  );
}

function TabPanel({ view, id }: { view: ContentView; id: TabId }) {
  const cards = view.ideas.filter((i) => IDEA_CARD_TABS.includes(id) && i.tab === id);
  const groups = view.ideas.filter((i) => i.pieces.some((p) => p.tab === id));
  if (cards.length + groups.length === 0) return <Empty view={view} id={id} />;
  return (
    <div className="flex flex-col gap-3">
      {cards.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} />
      ))}
      {groups.map((idea) => (
        <PieceGroup key={idea.id} idea={idea} tab={id} />
      ))}
    </div>
  );
}

/** The Content page: a headline, one line, the calm gaps, and six tabs. */
export function ContentPage({ view, template }: { view: ContentView; template: string | null }) {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-serif text-3xl">Content</h1>
        <p className="text-sm text-ink-muted">
          Ideas and drafts from your recent work. Nothing is posted until you post it.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <RunButton
          label="Make today's digest now"
          body={{ action: "make-digest" }}
          doneText="Making it now."
        />
        {view.voice
          .filter((v) => v.state === "ok")
          .map((v) => (
            <RunButton
              key={v.productId}
              label={`Find new ideas for ${v.name}`}
              body={{ action: "find-ideas", productId: v.productId }}
              doneText="Looking for ideas."
            />
          ))}
      </div>
      <Gaps view={view} template={template} />
      {view.capped && <p className="text-xs text-ink-muted">Showing the newest 200 ideas.</p>}
      {view.unreadable.map((path) => (
        <p key={path} className="text-xs text-ink-muted">
          This file couldn't be read: {path}
        </p>
      ))}
      <Tabs
        label="Content"
        defaultId={view.defaultTab}
        tabs={view.tabs.map((t) => ({
          id: t.id,
          label: `${t.label} (${t.count})`,
          panel: <TabPanel view={view} id={t.id} />,
        }))}
      />
    </div>
  );
}
