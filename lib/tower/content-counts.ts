// Content counts for the tower, from one content read. Pure: counts piece and idea states.

import type { ContentScan } from "@/lib/content/read/scan";

export type ContentCounts = { ready: number; needsYou: number; writing: number; ideas: number };

/**
 * Pieces ready for the owner, pieces that need them, work being written and ideas waiting, for
 * one product or all. Null when a content folder could not be read: a gap, never zeros.
 */
export function contentCounts(scan: ContentScan, productId?: string): ContentCounts | null {
  if (scan.folderError) return null;
  const counts: ContentCounts = { ready: 0, needsYou: 0, writing: 0, ideas: 0 };
  for (const { idea, product } of scan.entries) {
    if (productId !== undefined && product.id !== productId) continue;
    const pieces = scan.pieces.get(idea.id) ?? [];
    if (idea.front.state === "idea") counts.ideas += 1;
    if (idea.front.state === "drafting" && pieces.length === 0) counts.writing += 1;
    for (const { front } of pieces) {
      if (front.state === "ready") counts.ready += 1;
      else if (front.state === "needs-you") counts.needsYou += 1;
      else if (front.state === "drafting") counts.writing += 1;
    }
  }
  return counts;
}

/** Pieces approved on or after `firstDay` (YYYY-MM-DD); null when a folder could not be read. */
export function approvedSince(scan: ContentScan, firstDay: string): number | null {
  if (scan.folderError) return null;
  let n = 0;
  for (const pieces of scan.pieces.values()) {
    for (const { front } of pieces) {
      if (front.state === "approved" && front.approvedAt !== null && front.approvedAt >= firstDay) {
        n += 1;
      }
    }
  }
  return n;
}
