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
    expect(summariseLine("not json", root)).toEqual({ events: [], touched: [] });
    expect(summariseLine(line({ type: "system", subtype: "init" }), root)).toEqual({
      events: [],
      touched: [],
    });
  });

  it("never throws on malformed lines", () => {
    const bad = [
      assistant([null, 1, "x"]),
      line({ type: "assistant", message: null }),
      line({ type: "user", message: null }),
      line("str"),
      line(null),
      tool("Write", { file_path: 42 }),
      assistant([{ type: "tool_use", name: "Write", input: "str" }]),
      assistant([{ type: "tool_use", name: "WebSearch", input: null }]),
    ];
    for (const l of bad) expect(() => summariseLine(l, root)).not.toThrow();
    expect(summariseLine(tool("Write", { file_path: 42 }), root).events).toEqual([]);
    expect(summariseLine(assistant([null, 1, "x"]), root).events).toEqual([]);
  });

  it("lists the files Write and Edit calls touch, raw", () => {
    expect(
      summariseLine(tool("Write", { file_path: "/srv/brain/research/a.md" }), root).touched,
    ).toEqual(["/srv/brain/research/a.md"]);
    const both = assistant([
      { type: "tool_use", name: "Edit", input: { file_path: "notes/b.md" } },
      { type: "tool_use", name: "NotebookEdit", input: { notebook_path: "/srv/brain/n.ipynb" } },
      { type: "tool_use", name: "Read", input: { file_path: "/srv/brain/c.md" } },
      { type: "tool_use", name: "WebFetch", input: { url: "https://example.com" } },
    ]);
    expect(summariseLine(both, root).touched).toEqual(["notes/b.md", "/srv/brain/n.ipynb"]);
    expect(summariseLine(tool("Read", { file_path: "/srv/brain/c.md" }), root).touched).toEqual([]);
  });

  it("marks a write tool call without a usable path as unknown", () => {
    expect(summariseLine(tool("Write", { file_path: 42 }), root).touched).toEqual(["*"]);
    expect(
      summariseLine(assistant([{ type: "tool_use", name: "Edit", input: "str" }]), root).touched,
    ).toEqual(["*"]);
    expect(summariseLine("not json", root).touched).toEqual([]);
    const broken = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write"';
    expect(summariseLine(broken, root).touched).toEqual(["*"]);
  });

  it("extracts text from array tool-result content", () => {
    const err = line({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            is_error: true,
            content: [
              { type: "text", text: "Denied" },
              { type: "text", text: "outside root" },
            ],
          },
        ],
      },
    });
    expect(summariseLine(err, root).events).toEqual([
      { kind: "error", text: "Tool error: Denied\noutside root" },
    ]);
  });

  it("clips the final result text", () => {
    const out = summariseLine(
      line({ type: "result", subtype: "success", result: "y".repeat(5000) }),
      root,
    ).result;
    expect(out?.text.length).toBeLessThanOrEqual(1001);
  });
});
