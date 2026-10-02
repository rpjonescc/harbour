import type { JobKind } from "./queue";

/** The content machine's agent kinds (the decision job is not an agent: it writes through git). */
export const CONTENT_AGENT_KINDS = [
  "content-digest",
  "content-ideas",
  "content-draft",
  "content-atomise",
  "content-gate",
] as const satisfies readonly JobKind[];

/** The kinds the agent runner handles; the worker fails any kind it has no runner for. */
export const AGENT_JOB_KINDS = [
  "research",
  "discovery",
  "weekly-analyst",
  "daily-note",
  ...CONTENT_AGENT_KINDS,
] as const satisfies readonly JobKind[];

export type AgentJobKind = (typeof AGENT_JOB_KINDS)[number];

export function isAgentJobKind(kind: string): kind is AgentJobKind {
  return (AGENT_JOB_KINDS as readonly string[]).includes(kind);
}
