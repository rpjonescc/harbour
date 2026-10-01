/**
 * Calls `beat` every `everyMs` while a job runs; returns the function that stops it. A failed
 * beat (e.g. a briefly locked database) is logged, never thrown: it must not crash the worker.
 */
export function keepAlive(jobId: number, beat: () => void, everyMs: number): () => void {
  const timer = setInterval(() => {
    try {
      beat();
    } catch (error) {
      console.error(`job ${jobId}: heartbeat failed`, error);
    }
  }, everyMs);
  return () => clearInterval(timer);
}
