import type { DocView } from "@/lib/brain/view-model";
import { DocArticle } from "./DocArticle";
import { RefreshWhenNew } from "./RefreshWhenNew";
import { ViewedDoc } from "./ViewedDoc";

/** A document page: the article, plus telling the tree and shell that it has been seen. */
export function DocPage({ view }: { view: DocView }) {
  return (
    <>
      <ViewedDoc path={view.doc.path} />
      <RefreshWhenNew path={view.doc.path} wasNew={view.wasNew} />
      <DocArticle view={view} />
    </>
  );
}
