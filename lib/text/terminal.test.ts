import { forTerminal } from "./terminal";

const ESC = "\u001b";

describe("forTerminal", () => {
  it("removes ANSI colour, cursor and title sequences", () => {
    expect(forTerminal(`a${ESC}[31mred${ESC}[0m b`)).toBe("ared b");
    expect(forTerminal(`x${ESC}[2J${ESC}[1;1Hy`)).toBe("xy");
    expect(forTerminal(`${ESC}]0;Owned${"\u0007"}title`)).toBe("title");
    expect(forTerminal(`${ESC}]8;;https://example.com${ESC}\\link${ESC}]8;;${ESC}\\`)).toBe("link");
    expect(forTerminal("a\u009b31mb")).toBe("ab");
  });

  it("removes C0 and C1 control characters and DEL", () => {
    expect(forTerminal("a\u0000b\u0007c\u0008d\u007fe\u0085f\u009fg\rh")).toBe("abcdefgh");
  });

  it("keeps newlines and tabs only when asked, else turns them into spaces", () => {
    expect(forTerminal("one\ntwo\tthree", { multiline: true })).toBe("one\ntwo\tthree");
    expect(forTerminal("one\nStatus: done\ttwo")).toBe("one Status: done two");
  });

  it("leaves ordinary text, including non-ASCII, alone", () => {
    expect(forTerminal("Café → “quoted” 日本")).toBe("Café → “quoted” 日本");
  });
});
