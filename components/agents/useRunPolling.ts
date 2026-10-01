"use client";

import { useEffect, useRef, useState } from "react";
import { isActive } from "@/lib/agents/view";
import type { RunEvent, RunJob } from "./run-types";

const POLL_MS = 2000;

/**
 * Polls a run's status and new events every 2 s while it is queued or running. Responses that
 * arrive after unmount (or after the run changed) are dropped; events are appended by id only.
 */
export function useRunPolling(initialJob: RunJob, initialEvents: RunEvent[]) {
  const [job, setJob] = useState(initialJob);
  const [events, setEvents] = useState(initialEvents);
  const [lostConnection, setLostConnection] = useState(false);
  const lastId = useRef(initialEvents.at(-1)?.id ?? 0);
  const active = isActive(job.status);

  useEffect(() => {
    if (!active) return;
    let live = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/agents/${initialJob.id}?after=${lastId.current}`);
        if (!response.ok) throw new Error(`http_${response.status}`);
        const data = (await response.json()) as { job: RunJob; events: RunEvent[] };
        if (!live) return;
        const fresh = data.events.filter((event) => event.id > lastId.current);
        if (fresh.length > 0) {
          lastId.current = fresh.at(-1)?.id ?? lastId.current;
          setEvents((current) => [...current, ...fresh]);
        }
        setJob(data.job);
        setLostConnection(false);
      } catch {
        if (live) setLostConnection(true);
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(poll, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [active, initialJob.id]);

  return { job, setJob, events, lostConnection };
}
