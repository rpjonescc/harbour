"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TreeNode } from "@/lib/brain/tree";
import { brainHref } from "@/lib/brain/wikilinks";

function Nodes({
  nodes,
  current,
  fresh,
}: {
  nodes: TreeNode[];
  current: string;
  fresh: Set<string>;
}) {
  return (
    <ul className="flex flex-col gap-0.5 pl-2">
      {nodes.map((node) =>
        node.kind === "dir" ? (
          <li key={node.path}>
            <details open={current.startsWith(brainHref(node.path))}>
              <summary className="cursor-pointer rounded-sm px-1.5 py-1 text-sm font-medium">
                {node.name}
              </summary>
              <Nodes nodes={node.children} current={current} fresh={fresh} />
            </details>
          </li>
        ) : (
          <li key={node.path}>
            <Link
              href={brainHref(node.path)}
              aria-current={current === brainHref(node.path) ? "page" : undefined}
              className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-sm text-ink-muted hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink"
            >
              <span className="truncate">{node.name.replace(/\.md$/, "")}</span>
              {fresh.has(node.path) && (
                <span className="ml-auto size-1.5 shrink-0 rounded-full bg-accent">
                  <span className="sr-only">new</span>
                </span>
              )}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

/** Folder tree with the current document highlighted and new documents dotted. */
export function BrainTree({
  nodes,
  freshPaths,
  truncated,
}: {
  nodes: TreeNode[];
  freshPaths: string[];
  truncated: boolean;
}) {
  const current = usePathname();
  return (
    <div className="-ml-2">
      <Nodes nodes={nodes} current={current} fresh={new Set(freshPaths)} />
      {truncated && (
        <p className="px-2 pt-2 text-xs text-warn">Tree truncated at 5,000 documents.</p>
      )}
    </div>
  );
}
