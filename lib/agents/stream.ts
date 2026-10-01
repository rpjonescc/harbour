import { relative } from "node:path";

export type AgentEvent = { kind: "tool" | "text" | "error" | "status"; text: string };
export type StreamResult = { isError: boolean; text: string };

type Block = {
  type?: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
  is_error?: boolean;
  content?: unknown;
};

type StreamEvent = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  message?: { content?: Block[] };
};

const clip = (text: string, max = 200) => (text.length > max ? `${text.slice(0, max)}…` : text);
const str = (v: unknown) => (typeof v === "string" ? v : "");

function describeTool(block: Block, root: string): AgentEvent | null {
  const input = block.input ?? {};
  const file = () => relative(root, str(input.file_path)) || str(input.file_path);
  switch (block.name) {
    case "WebSearch":
      return { kind: "tool", text: `Searching: ${clip(str(input.query))}` };
    case "WebFetch":
      return { kind: "tool", text: `Reading: ${clip(str(input.url))}` };
    case "Write":
      return { kind: "tool", text: `Writing: ${file()}` };
    case "Edit":
      return { kind: "tool", text: `Editing: ${file()}` };
    case "Read":
      return { kind: "tool", text: `Opening: ${file()}` };
    default:
      return null; // Glob/Grep and anything else are noise in the activity feed
  }
}

/** One stream-json line → activity events and, for the final line, the run result. */
export function summariseLine(
  line: string,
  root: string,
): { events: AgentEvent[]; result?: StreamResult } {
  let event: StreamEvent;
  try {
    event = JSON.parse(line) as StreamEvent;
  } catch {
    return { events: [] };
  }
  if (!event || typeof event !== "object") return { events: [] };
  const content = Array.isArray(event.message?.content) ? event.message.content : [];
  if (event.type === "assistant") {
    const events: AgentEvent[] = [];
    for (const block of content) {
      if (block.type === "tool_use") {
        const described = describeTool(block, root);
        if (described) events.push(described);
      } else if (block.type === "text" && str(block.text).trim()) {
        events.push({ kind: "text", text: clip(str(block.text).trim()) });
      }
    }
    return { events };
  }
  if (event.type === "user") {
    const events = content
      .filter((block) => block.type === "tool_result" && block.is_error)
      .map((block) => ({
        kind: "error" as const,
        text: `Tool error: ${clip(str(block.content))}`,
      }));
    return { events };
  }
  if (event.type === "system" && event.subtype === "api_retry") {
    return { events: [{ kind: "status", text: "Retrying the API…" }] };
  }
  if (event.type === "result") {
    return {
      events: [],
      result: {
        isError: event.is_error === true || event.subtype !== "success",
        text: str(event.result),
      },
    };
  }
  return { events: [] };
}
