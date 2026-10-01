import { BrainHeader } from "@/components/brain/BrainHeader";
import { BrainNav } from "@/components/brain/BrainNav";
import { BrainSetupNotice } from "@/components/brain/BrainSetupNotice";
import { BrainTree } from "@/components/brain/BrainTree";
import { DocArticle } from "@/components/brain/DocArticle";
import { DocMeta } from "@/components/brain/DocMeta";
import { RecentDocs } from "@/components/brain/RecentDocs";
import { SearchDialog } from "@/components/brain/SearchDialog";
import type { DocView } from "@/lib/brain/view-model";

const example: DocView = {
  doc: {
    path: "examples/field-guide.md",
    absolutePath: "/example/brain/field-guide.md",
    title: "Field guide",
    frontmatter: {},
    frontmatterError: "Confidence must be low, medium, or high",
    body: "",
    mtime: new Date("2026-01-10T00:00:00Z"),
    tooLarge: false,
  },
  html: "<p>An example document with an outline and a backlink.</p>",
  outline: [{ id: "h-next-steps", text: "Next steps", depth: 2 }],
  backlinks: [{ path: "examples/start.md", title: "Start here" }],
  editorUrl: null,
  stale: false,
  wasNew: false,
};

/** Fictional viewer states for checking components in both colour themes. */
export function BrainExamples() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-ink-muted">Illustrative documents and states.</p>
      <BrainHeader watchError={null} indexError={null} titleLevel={2}>
        <SearchDialog />
      </BrainHeader>
      <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <BrainNav label="Example documents">
          <BrainTree
            nodes={[
              {
                kind: "dir",
                name: "examples",
                path: "examples",
                children: [
                  { kind: "file", name: "field-guide.md", path: "examples/field-guide.md" },
                ],
              },
            ]}
            freshPaths={["examples/field-guide.md"]}
            truncated={false}
          />
        </BrainNav>
        <DocArticle view={example} titleLevel={2} />
      </div>
      <DocMeta frontmatter={{ tags: ["research"], review_by: "2026-02-01" }} stale />
      <RecentDocs docs={[{ path: "examples/field-guide.md", title: "Field guide" }]} />
      <BrainSetupNotice root="/example/brain" reason="missing" />
    </div>
  );
}
