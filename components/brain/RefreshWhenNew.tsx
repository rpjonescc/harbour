"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Refreshes server components once after a new document is opened, so the tree dot and the
 * sidebar count catch up. The refreshed render reports the document as not new, and the ref
 * keyed by path stops any repeat for the same document.
 */
export function RefreshWhenNew({ path, wasNew }: { path: string; wasNew: boolean }) {
  const router = useRouter();
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!wasNew || refreshedFor.current === path) return;
    refreshedFor.current = path;
    router.refresh();
  }, [path, wasNew, router]);
  return null;
}
