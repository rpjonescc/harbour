import { Tag } from "@/components/ui/Tag";
import type { Frontmatter } from "@/lib/brain/frontmatter";

/** Frontmatter pills: tags, research date, confidence, and a stale warning. */
export function DocMeta({ frontmatter, stale }: { frontmatter: Frontmatter; stale: boolean }) {
  const { tags = [], researched, confidence, review_by } = frontmatter;
  if (tags.length === 0 && !researched && !confidence && !stale) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Tag key={tag}>{tag}</Tag>
      ))}
      {researched && <Tag tone="neutral">Researched {researched}</Tag>}
      {confidence && <Tag tone="neutral">Confidence: {confidence}</Tag>}
      {stale && <Tag tone="warn">Stale — review was due {review_by}</Tag>}
    </div>
  );
}
