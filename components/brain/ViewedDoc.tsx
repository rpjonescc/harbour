"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

type ViewedDocState = { viewedPath: string | null; setViewedPath: (path: string | null) => void };

const ViewedDocContext = createContext<ViewedDocState>({
  viewedPath: null,
  setViewedPath: () => {},
});

/** Shares the document a page is showing with the tree in the surrounding layout. */
export function ViewedDocProvider({ children }: { children: ReactNode }) {
  const [viewedPath, setViewedPath] = useState<string | null>(null);
  return (
    <ViewedDocContext.Provider value={{ viewedPath, setViewedPath }}>
      {children}
    </ViewedDocContext.Provider>
  );
}

/** Brain-relative path of the document on screen, or null. */
export function useViewedPath(): string | null {
  return useContext(ViewedDocContext).viewedPath;
}

/** Rendered by a document page to report which document it shows (e.g. the start doc at /brain). */
export function ViewedDoc({ path }: { path: string }) {
  const { setViewedPath } = useContext(ViewedDocContext);
  useEffect(() => {
    setViewedPath(path);
    return () => setViewedPath(null);
  }, [path, setViewedPath]);
  return null;
}
