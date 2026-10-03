import { EmptyState } from "@/components/explain/EmptyState";
import { PageHeader } from "@/components/explain/PageHeader";
import { TermLine } from "@/components/explain/TermLine";
import { Tabs } from "@/components/ui/Tabs";
import type { ContentView, TabId } from "@/lib/content/read/view-types";
import {
  CAP_NOTES,
  CONTENT_INTRO,
  type ContentCounts,
  contentVerdict,
  EMPTY_TABS,
  FOLDER_ERROR,
} from "@/lib/explain/content";
import { Gaps } from "./Gaps";
import { IdeaCard } from "./IdeaCard";
import { IdeaDiscard } from "./IdeaDiscard";
import { PieceGroup } from "./PieceGroup";
import { RunButton } from "./RunButton";

const IDEA_CARD_TABS: TabId[] = ["ideas", "writing", "needs-you", "discarded"];

function Empty({ view, id }: { view: ContentView; id: TabId }) {
  if (id === "ideas" && view.voice.every((v) => v.state === "ok")) {
    return <p className="text-sm text-ink-muted">Nothing waiting. Enjoy the quiet.</p>;
  }
  const words = EMPTY_TABS[id];
  return (
    <EmptyState
      what={words.what}
      when={words.when}
      why={id === "ideas" ? "Write a voice profile first." : words.why}
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
        <IdeaCard key={idea.id} idea={idea}>
          {id !== "discarded" && <IdeaDiscard idea={idea} />}
        </IdeaCard>
      ))}
      {groups.map((idea) => (
        <PieceGroup key={idea.id} idea={idea} tab={id} />
      ))}
    </div>
  );
}

/** Each tab's count, for the page's verdict. */
function tabCounts(view: ContentView): ContentCounts {
  const of = (id: TabId) => view.tabs.find((tab) => tab.id === id)?.count ?? 0;
  return {
    ready: of("ready"),
    "needs-you": of("needs-you"),
    ideas: of("ideas"),
    writing: of("writing"),
    approved: of("approved"),
    discarded: of("discarded"),
  };
}

/** The Content page: a headline, one line, the calm gaps, and six tabs. */
export function ContentPage({ view, template }: { view: ContentView; template: string | null }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Content"
        page="content"
        verdict={contentVerdict(tabCounts(view))}
        intro={
          <p>
            <TermLine line={CONTENT_INTRO} />
          </p>
        }
      />
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
      {view.folderError && <p className="text-sm text-ink">{FOLDER_ERROR}</p>}
      {view.capped && <p className="text-xs text-ink-muted">{CAP_NOTES[view.capped]}</p>}
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
