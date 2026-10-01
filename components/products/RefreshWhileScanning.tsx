"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 10_000;
/** An hour: a scan may wait behind an agent run (up to 30 min) and then take ~15 min itself. */
const MAX_REFRESHES = 360;

/** Re-renders the page's server data every 10 s while a scan is queued or running. */
export function RefreshWhileScanning({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= MAX_REFRESHES) clearInterval(timer);
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
