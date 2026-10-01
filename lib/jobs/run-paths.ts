import { join } from "node:path";

/** The private folder holding run markers, touched-path sidecars and the recovery error. */
export const activeDir = (quarantineRoot: string) => join(quarantineRoot, "active");

/** A run's marker: the durable copy of its snapshot. */
export const markerPath = (quarantineRoot: string, jobId: number | string) =>
  join(activeDir(quarantineRoot), `job-${jobId}.json`);

/** A run's touched-path sidecar, next to its marker. */
export const touchedPath = (quarantineRoot: string, jobId: number | string) =>
  join(activeDir(quarantineRoot), `job-${jobId}.touched`);
