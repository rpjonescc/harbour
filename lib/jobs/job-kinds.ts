import type { JobKind } from "./queue";

/** The kinds the agent runner handles; the worker fails any kind it has no runner for. */
export const AGENT_JOB_KINDS = [
  "research",
  "discovery",
  "weekly-analyst",
] as const satisfies readonly JobKind[];

export type AgentJobKind = (typeof AGENT_JOB_KINDS)[number];

export function isAgentJobKind(kind: string): kind is AgentJobKind {
  return (AGENT_JOB_KINDS as readonly string[]).includes(kind);
}
