import { relative } from "node:path";
import { UNKNOWN_TOUCH } from "./attribution";

export type AgentEvent = { kind: "tool" | "text" | "error" | "status"; text: string };
export type StreamResult = { isError: boolean; text: string };
/** `touched`: raw target paths of the line's file-writing tool calls (UNKNOWN_TOUCH if unclear). */
export type LineSummary = { events: AgentEvent[]; touched: string[]; result?: StreamResult };

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

// Claude Code's file-writing tools and the input field naming their target.
const WRITE_TOOLS = new Map([
  ["Write", "file_path"],
  ["Edit", "file_path"],
  ["MultiEdit", "file_path"],
  ["NotebookEdit", "notebook_path"],
]);

/** The target of a file-writing tool call, UNKNOWN_TOUCH when it has none; null for other tools. */
function touchedBy(block: Block): string | null {
  const field = WRITE_TOOLS.get(str(block.name));
  if (field === undefined) return null;
  const target = isObject(block.input) ? block.input[field] : undefined;
  return typeof target === "string" && target ? target : UNKNOWN_TOUCH;
}

/**
 * One stream-json line → activity events, the files it is about to write and, for the final
 * line, the run result. Never throws.
 */
export function summariseLine(line: string, root: string): LineSummary {
  try {
    return summarise(line, root);
  } catch {
    // A line that cannot be read may still have been a write: its target is unknown.
    return { events: [], touched: line.includes('"tool_use"') ? [UNKNOWN_TOUCH] : [] };
  }
}

function summarise(line: string, root: string): LineSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    // An unreadable line may still announce a write: its target is unknown.
    return { events: [], touched: line.includes('"tool_use"') ? [UNKNOWN_TOUCH] : [] };
  }
  if (!isObject(parsed)) return { events: [], touched: [] };
  const event = parsed as StreamEvent;
  const raw = isObject(event.message) ? event.message.content : undefined;
  const content: Block[] = Array.isArray(raw) ? (raw.filter(isObject) as Block[]) : [];
  if (event.type === "assistant") {
    const events: AgentEvent[] = [];
    const touched: string[] = [];
    for (const block of content) {
      if (block.type === "tool_use") {
        const target = touchedBy(block);
        if (target !== null) touched.push(target);
        const described = describeTool(block, root);
        if (described) events.push(described);
      } else if (block.type === "text" && str(block.text).trim()) {
        events.push({ kind: "text", text: clip(str(block.text).trim()) });
      }
    }
    return { events, touched };
  }
  if (event.type === "user") {
    const events = content
      .filter((block) => block.type === "tool_result" && block.is_error)
      .map((block) => ({
        kind: "error" as const,
        text: `Tool error: ${clip(resultText(block.content))}`,
      }));
    return { events, touched: [] };
  }
  if (event.type === "system" && event.subtype === "api_retry") {
    return { events: [{ kind: "status", text: "Retrying the API…" }], touched: [] };
  }
  if (event.type === "result") {
    return {
      events: [],
      touched: [],
      result: {
        isError: event.is_error === true || event.subtype !== "success",
        text: clip(str(event.result), 1000),
      },
    };
  }
  return { events: [], touched: [] };
}
