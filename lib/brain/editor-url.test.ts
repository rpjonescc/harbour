import { editorUrlFor } from "./editor-url";

describe("editorUrlFor", () => {
  it("fills the path placeholder with an encoded absolute path", () => {
    expect(editorUrlFor("vscode://file/{path}", "/srv/brain/a b.md")).toBe(
      "vscode://file//srv/brain/a%20b.md",
    );
  });
  it("returns null when disabled", () => {
    expect(editorUrlFor("", "/srv/brain/a.md")).toBeNull();
  });

  it("encodes URL delimiters in a file name", () => {
    expect(editorUrlFor("vscode://file/{path}", "/srv/brain/why#what?.md")).toBe(
      "vscode://file//srv/brain/why%23what%3F.md",
    );
  });
});
