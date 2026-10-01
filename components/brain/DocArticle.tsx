import type { DocView } from "@/lib/brain/view-model";
import { ContextRail } from "./ContextRail";
import { DocMeta } from "./DocMeta";

function EditorLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className="text-accent hover:underline">
      {children}
    </a>
  );
}

function TooLargeNotice({ editorUrl }: { editorUrl: string | null }) {
  return (
    <p role="note" className="mt-6 rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn">
      This document is larger than 2 MB and isn't shown.{" "}
      {editorUrl && <EditorLink href={editorUrl}>Open it in your editor</EditorLink>}
    </p>
  );
}

/** A rendered document with its metadata and context rail. */
export function DocArticle({ view, titleLevel = 1 }: { view: DocView; titleLevel?: 1 | 2 }) {
  const { doc } = view;
  const Title = titleLevel === 1 ? "h1" : "h2";
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
      <article className="min-w-0 rounded-md border border-line bg-surface px-6 py-7 sm:px-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <p className="font-mono text-ink-muted">{doc.path}</p>
          {view.editorUrl && !doc.tooLarge && (
            <EditorLink href={view.editorUrl}>Open in editor</EditorLink>
          )}
        </div>
        <Title className="mt-2 font-serif text-3xl leading-tight">{doc.title}</Title>
        <DocMeta frontmatter={doc.frontmatter} stale={view.stale} />
        {doc.frontmatterError && (
          <p role="note" className="mt-4 rounded-sm bg-warn-soft px-3 py-2 text-xs text-warn">
            Frontmatter invalid — showing the document without it: {doc.frontmatterError}
          </p>
        )}
        {doc.tooLarge ? (
          <TooLargeNotice editorUrl={view.editorUrl} />
        ) : (
          <div
            className="brain-prose mt-6"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitised by rehype-sanitize in lib/brain/render.ts
            dangerouslySetInnerHTML={{ __html: view.html }}
          />
        )}
      </article>
      <ContextRail
        outline={view.outline}
        linkedFrom={view.backlinks}
        sources={doc.frontmatter.sources ?? []}
      />
    </div>
  );
}
