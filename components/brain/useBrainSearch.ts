"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { SearchHit } from "@/lib/brain/search";

const DEBOUNCE_MS = 150;
const searchResponse = z.object({
  hits: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      snippet: z.array(z.object({ text: z.string(), hit: z.boolean() })),
    }),
  ),
});

/** Debounced, cancellable search against /api/brain/search. */
export function useBrainSearch(query: string) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/brain/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = searchResponse.parse(await response.json());
        setHits(data.hits);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setHits([]);
        setError(cause instanceof Error ? `Search failed (${cause.message})` : "Search failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { hits, loading, error };
}
