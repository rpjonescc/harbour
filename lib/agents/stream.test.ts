import { summariseLine } from "./stream";

const root = "/srv/brain";
const line = (o: unknown) => JSON.stringify(o);
const assistant = (content: unknown[]) => line({ type: "assistant", message: { content } });
const tool = (name: string, input: Record<string, unknown>) =>
  assistant([{ type: "tool_use", name, input }]);

describe("summariseLine", () => {
  it("describes tool use in plain words with brain-relative paths", () => {
    expect(
      summariseLine(tool("WebSearch", { query: "how perplexity cites" }), root).events,
    ).toEqual([{ kind: "tool", text: "Searching: how perplexity cites" }]);
    expect(summariseLine(tool("WebFetch", { url: "https://example.com/a" }), root).events).toEqual([
      { kind: "tool", text: "Reading: https://example.com/a" },
    ]);
    expect(
      summariseLine(tool("Write", { file_path: "/srv/brain/research/geo/a.md" }), root).events,
    ).toEqual([{ kind: "tool", text: "Writing: research/geo/a.md" }]);
    expect(summariseLine(tool("Edit", { file_path: "/srv/brain/x.md" }), root).events).toEqual([
      { kind: "tool", text: "Editing: x.md" },
    ]);
  });

  it("skips noisy lookups but keeps short assistant text", () => {
    expect(summariseLine(tool("Glob", {}), root).events).toEqual([]);
    const long = "x".repeat(400);
    const [event] = summariseLine(assistant([{ type: "text", text: long }]), root).events;
    expect(event?.kind).toBe("text");
    expect(event?.text.length).toBeLessThanOrEqual(201);
  });

  it("reports tool errors and API retries", () => {
    const err = line({
      type: "user",
      message: {
        content: [{ type: "tool_result", is_error: true, content: "Permission denied for ../x" }],
      },
    });
    expect(summariseLine(err, root).events).toEqual([
      { kind: "error", text: "Tool error: Permission denied for ../x" },
    ]);
    expect(summariseLine(line({ type: "system", subtype: "api_retry" }), root).events).toEqual([
      { kind: "status", text: "Retrying the API…" },
    ]);
  });

  it("returns the final result", () => {
    expect(
      summariseLine(
        line({ type: "result", subtype: "success", is_error: false, result: "done" }),
        root,
      ).result,
    ).toEqual({
      isError: false,
      text: "done",
    });
    expect(
      summariseLine(
        line({ type: "result", subtype: "success", is_error: true, result: "Not logged in" }),
        root,
      ).result,
    ).toEqual({ isError: true, text: "Not logged in" });
  });

  it("ignores non-JSON and unknown lines", () => {
    expect(summariseLine("not json", root)).toEqual({ events: [] });
    expect(summariseLine(line({ type: "system", subtype: "init" }), root)).toEqual({ events: [] });
  });
});
