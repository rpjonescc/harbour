import type { DocView } from "@/lib/brain/view-model";
import { ContextRail } from "./ContextRail";
import { DocMeta } from "./DocMeta";

/** A rendered document with its metadata and context rail. */
export function DocArticle({ view }: { view: DocView }) {
  const { doc } = view;
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
      <article className="min-w-0 rounded-md border border-line bg-surface px-6 py-7 sm:px-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-xs text-ink-muted">{doc.path}</p>
          {view.editorUrl && (
            <a href={view.editorUrl} className="text-xs text-accent hover:underline">
              Open in editor
            </a>
          )}
        </div>
        <h1 className="mt-2 font-serif text-3xl leading-tight">{doc.title}</h1>
        <DocMeta frontmatter={doc.frontmatter} stale={view.stale} />
        {doc.frontmatterError && (
          <p role="note" className="mt-4 rounded-sm bg-warn-soft px-3 py-2 text-xs text-warn">
            Frontmatter invalid — showing the document without it: {doc.frontmatterError}
          </p>
        )}
        <div
          className="brain-prose mt-6"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitised by rehype-sanitize in lib/brain/render.ts
          dangerouslySetInnerHTML={{ __html: view.html }}
        />
      </article>
      <ContextRail
        outline={view.outline}
        linkedFrom={view.backlinks}
        sources={doc.frontmatter.sources ?? []}
      />
    </div>
  );
}
