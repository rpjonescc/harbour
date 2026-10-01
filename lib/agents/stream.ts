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

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Tool-result content is a string or an array of text blocks. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(isObject)
    .map((b) => str(b.text))
    .filter(Boolean)
    .join("\n");
}

function describeTool(block: Block, root: string): AgentEvent | null {
  const input = isObject(block.input) ? block.input : {};
  const file = (): string | null => {
    const path = input.file_path;
    if (typeof path !== "string" || !path) return null;
    return relative(root, path) || path;
  };
  const withFile = (verb: string): AgentEvent | null => {
    const f = file();
    return f ? { kind: "tool", text: `${verb}: ${f}` } : null;
  };
  switch (block.name) {
    case "WebSearch":
      return { kind: "tool", text: `Searching: ${clip(str(input.query))}` };
    case "WebFetch":
      return { kind: "tool", text: `Reading: ${clip(str(input.url))}` };
    case "Write":
      return withFile("Writing");
    case "Edit":
      return withFile("Editing");
    case "Read":
      return withFile("Opening");
    default:
      return null; // Glob/Grep and anything else are noise in the activity feed
  }
}

/** One stream-json line → activity events and, for the final line, the run result. Never throws. */
export function summariseLine(
  line: string,
  root: string,
): { events: AgentEvent[]; result?: StreamResult } {
  try {
    return summarise(line, root);
  } catch {
    return { events: [] };
  }
}

function summarise(line: string, root: string): { events: AgentEvent[]; result?: StreamResult } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { events: [] };
  }
  if (!isObject(parsed)) return { events: [] };
  const event = parsed as StreamEvent;
  const raw = isObject(event.message) ? event.message.content : undefined;
  const content: Block[] = Array.isArray(raw) ? (raw.filter(isObject) as Block[]) : [];
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
        text: `Tool error: ${clip(resultText(block.content))}`,
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
        text: clip(str(event.result), 1000),
      },
    };
  }
  return { events: [] };
}
